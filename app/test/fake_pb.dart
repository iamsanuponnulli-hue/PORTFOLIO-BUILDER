import 'dart:convert';
import 'dart:io';

import 'package:portfolio_builder/core/js/pb_bridge.dart';

/// A stand-in for window.pb in VM tests: keeps drafts in memory, applies a few
/// operations in Dart, renders a tiny page and answers configured calls.
class FakePb implements PbBridge {
  final drafts = <String, Map<String, dynamic>>{};
  final calls = <String>[];
  final appliedOps = <Map<String, dynamic>>[];
  final prefs = <String, String>{};

  /// Answers for invoke('namespace', 'method'), by "namespace.method".
  final answers = <String, PbResult>{};

  @override
  bool get available => true;
  @override
  String get version => 'fake';
  @override
  String ping() => 'pong';
  @override
  Future<String> workerPing() async => 'pong';
  @override
  void setUser(String uid) {}
  @override
  String providersJson() => '[]';
  @override
  String prefsGet(String key) => prefs[key] ?? '';
  @override
  void prefsSet(String key, String value) => prefs[key] = value;
  @override
  String extensionVersion() => '';
  @override
  String catalogJson() => File('test/fixtures/catalog.json').readAsStringSync();
  @override
  Future<String> normalizeContent(String json) async => json;

  @override
  Future<String> defaultSpec(String profileType, [String? presetId]) async =>
      File('test/fixtures/spec_developer.json').readAsStringSync();

  @override
  Future<String> render(String stateJson, String optionsJson) async {
    calls.add('render');
    final state = jsonDecode(stateJson) as Map<String, dynamic>;
    final name = state['content']['profile']['name'];
    return jsonEncode({
      'files': {
        'index.html': '<h1>$name</h1>',
        'assets/css/custom.css': state['custom']['css'],
      },
      'checks': [
        if ((name as String).isEmpty)
          {'id': 'no-name', 'severity': 'error', 'message': 'Add your name.'},
      ],
      'fonts': <String>[],
    });
  }

  @override
  String previewDocument(
    String filesJson, [
    String page = 'index.html',
    bool editor = false,
  ]) =>
      '${(jsonDecode(filesJson) as Map)[page]}${editor ? '<!--editor-->' : ''}';

  /// Supports the operations the tests use.
  @override
  Future<String> applyOperations(String stateJson, String opsJson) async {
    final s = jsonDecode(stateJson) as Map<String, dynamic>;
    for (final op
        in (jsonDecode(opsJson) as List).cast<Map<String, dynamic>>()) {
      appliedOps.add(op);
      final sections = (s['spec']['sections'] as List)
          .cast<Map<String, dynamic>>();
      switch (op['op']) {
        case 'toggleSection':
          final x = sections.firstWhere((x) => x['id'] == op['id']);
          x['visible'] = !(x['visible'] as bool);
        case 'setVariant':
          sections.firstWhere((x) => x['id'] == op['id'])['variant'] =
              op['variant'];
        case 'updateContent':
          final path = (op['path'] as String).split('.');
          Object node = s['content'] as Object;
          for (final k in path.take(path.length - 1)) {
            node = (node as Map)[k] as Object;
          }
          (node as Map)[path.last] = op['value'];
        case 'updateTheme':
          (s['spec']['theme'] as Map).addAll(op['tokens'] as Map);
        case 'editCustomCode':
          s['custom'][op['file'] == 'custom.css' ? 'css' : 'js'] =
              op['content'];
        case 'setSectionOptions':
          (sections.firstWhere((x) => x['id'] == op['id'])['options'] as Map)
              .addAll(op['options'] as Map);
        default:
          throw PbException('error', 'Unsupported op in tests: ${op['op']}');
      }
    }
    return jsonEncode(s);
  }

  @override
  Future<PbResult> invoke(
    String namespace,
    String method, [
    List<Object?> args = const [],
  ]) async {
    calls.add('$namespace.$method');
    if (namespace == 'drafts') {
      final id = args[0] as String;
      switch (method) {
        case 'save':
          drafts[id] = {
            'baseRevision': args[1],
            'data': jsonDecode(args[2] as String),
          };
          return const PbResult.ok(null);
        case 'get':
          return PbResult.ok(drafts[id]);
        case 'remove':
          drafts.remove(id);
          return const PbResult.ok(null);
      }
    }
    final answer = answers['$namespace.$method'];
    if (answer != null) return answer;
    if (namespace == 'files' && method == 'previewAssets') {
      return const PbResult.ok(<String, Object?>{});
    }
    return const PbResult.error('unavailable', 'Not in tests.');
  }
}
