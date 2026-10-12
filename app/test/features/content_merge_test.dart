import 'package:flutter_test/flutter_test.dart';
import 'package:portfolio_builder/features/setup/content_merge.dart';
import 'package:portfolio_builder/models/generated/models.dart';

import '../helpers.dart';

void main() {
  final empty = PortfolioContent.fromJson(loadTemplates().content);

  PortfolioContent content(Map<String, dynamic> overrides) {
    final j = loadTemplates().content;
    j.addAll(overrides);
    return PortfolioContent.fromJson(j);
  }

  Map<String, dynamic> profile(Map<String, dynamic> p) => {
    ...loadTemplates().content['profile'] as Map<String, dynamic>,
    ...p,
  };

  test('fills only empty profile fields and never overwrites', () {
    final cur = content({
      'profile': profile({'name': 'Jane', 'headline': ''}),
    });
    final imp = content({
      'profile': profile({
        'name': 'J. Doe',
        'headline': 'Engineer',
        'email': 'j@x.io',
      }),
    });
    final m = mergeContent(cur, imp);
    expect(m.profile.name, 'Jane');
    expect(m.profile.headline, 'Engineer');
    expect(m.profile.email, 'j@x.io');
  });

  test('adds new items, skips look-alikes and keeps ids unique', () {
    Map<String, dynamic> exp(String id, String company) => {
      'id': id,
      'company': company,
      'role': 'Engineer',
      'start': '',
      'end': '',
      'location': '',
      'bullets': <String>[],
      'tech': <String>[],
    };
    final cur = content({
      'experience': [exp('e1', 'Brightcart')],
    });
    final imp = content({
      'experience': [exp('e1', 'BRIGHTCART'), exp('e1', 'Fernway')],
    });
    final m = mergeContent(cur, imp);
    expect(m.experience.map((e) => e.company), ['Brightcart', 'Fernway']);
    expect(m.experience.map((e) => e.id).toSet().length, 2);
  });

  test('merges skill groups by name', () {
    final cur = content({
      'skills': [
        {
          'group': 'Languages',
          'items': ['Go'],
        },
      ],
    });
    final imp = content({
      'skills': [
        {
          'group': 'languages',
          'items': ['go', 'SQL'],
        },
        {
          'group': 'Tools',
          'items': ['Docker'],
        },
      ],
    });
    final m = mergeContent(cur, imp);
    expect(m.skills.first.items, ['Go', 'SQL']);
    expect(m.skills.map((g) => g.group), ['Languages', 'Tools']);
  });

  test('turns a GitHub import into content', () {
    final c = githubContent({
      'profile': {
        'name': 'Jane Doe',
        'bio': 'Builder',
        'location': 'Lisbon',
        'blog': 'jane.dev',
        'htmlUrl': 'https://github.com/jane',
      },
      'projects': [
        {
          'id': 'gh-1',
          'title': 'Tidepool',
          'summary': 'Notes',
          'role': '',
          'tech': ['TS'],
          'tags': <String>[],
          'links': [
            {'label': 'GitHub', 'url': 'https://github.com/jane/tidepool'},
          ],
          'images': <Object>[],
          'featured': false,
        },
      ],
    }, empty);
    expect(c.profile.socials.map((s) => s.label), ['GitHub', 'Website']);
    expect(c.projects.single.title, 'Tidepool');
  });
}
