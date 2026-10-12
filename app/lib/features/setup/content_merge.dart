import 'dart:convert';

import '../../models/generated/models.dart';

/// Merges imported content (resume, GitHub) into what the user already has.
/// Never overwrites: empty profile fields are filled, new items are added,
/// and items that look like ones already there are skipped.
PortfolioContent mergeContent(
  PortfolioContent current,
  PortfolioContent imported,
) {
  final cur = _copy(current.toJson());
  final imp = _copy(imported.toJson());

  final p = cur['profile'] as Map<String, dynamic>;
  final ip = imp['profile'] as Map<String, dynamic>;
  for (final k in ['name', 'headline', 'tagline', 'bio', 'location', 'email']) {
    if ((p[k] as String? ?? '').trim().isEmpty &&
        (ip[k] as String? ?? '').trim().isNotEmpty) {
      p[k] = ip[k];
    }
  }
  final urls = {
    for (final s in p['socials'] as List) _norm((s as Map)['url'] as String),
  };
  for (final s in ip['socials'] as List) {
    if (urls.add(_norm((s as Map)['url'] as String))) {
      (p['socials'] as List).add(s);
    }
  }

  void mergeList(String key, String Function(Map<String, dynamic>) identity) {
    final list = cur[key] as List;
    final seen = {for (final x in list) identity(x as Map<String, dynamic>)};
    final ids = {for (final x in list) (x as Map)['id']};
    for (final x in imp[key] as List) {
      final item = x as Map<String, dynamic>;
      if (!seen.add(identity(item))) continue;
      var id = item['id'] as String;
      for (var n = 2; ids.contains(id); n++) {
        id = '${item['id']}-$n';
      }
      ids.add(id);
      list.add({...item, 'id': id});
    }
  }

  mergeList('experience', (e) => _norm('${e['company']}|${e['role']}'));
  mergeList('projects', (e) => _norm(e['title'] as String));
  mergeList('education', (e) => _norm(e['institution'] as String));
  mergeList('certifications', (e) => _norm(e['title'] as String));
  mergeList('awards', (e) => _norm(e['title'] as String));
  mergeList('writing', (e) => _norm(e['title'] as String));
  mergeList('testimonials', (e) => _norm(e['quote'] as String));

  final groups = cur['skills'] as List;
  for (final g in imp['skills'] as List) {
    final ig = g as Map<String, dynamic>;
    final match = groups.cast<Map<String, dynamic>>().where(
      (x) => _norm(x['group'] as String) == _norm(ig['group'] as String),
    );
    if (match.isEmpty) {
      groups.add(ig);
    } else {
      final items = match.first['items'] as List;
      final have = {for (final i in items) _norm(i as String)};
      for (final i in ig['items'] as List) {
        if (have.add(_norm(i as String))) items.add(i);
      }
    }
  }
  return PortfolioContent.fromJson(cur);
}

/// Content from a GitHub import: projects, plus profile details and links.
PortfolioContent githubContent(
  Map<String, dynamic> imported,
  PortfolioContent empty,
) {
  final j = _copy(empty.toJson());
  final profile = imported['profile'] as Map<String, dynamic>? ?? const {};
  final p = j['profile'] as Map<String, dynamic>;
  p['name'] = profile['name'] ?? '';
  p['bio'] = profile['bio'] ?? '';
  p['location'] = profile['location'] ?? '';
  final socials = <Map<String, dynamic>>[];
  if ((profile['htmlUrl'] as String? ?? '').isNotEmpty) {
    socials.add({'label': 'GitHub', 'url': profile['htmlUrl']});
  }
  final blog = (profile['blog'] as String? ?? '').trim();
  if (blog.isNotEmpty) socials.add({'label': 'Website', 'url': blog});
  p['socials'] = socials;
  j['projects'] = imported['projects'] ?? const [];
  return PortfolioContent.fromJson(j);
}

String _norm(String s) =>
    s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9|]+'), '');

Map<String, dynamic> _copy(Map<String, dynamic> m) =>
    jsonDecode(jsonEncode(m)) as Map<String, dynamic>;
