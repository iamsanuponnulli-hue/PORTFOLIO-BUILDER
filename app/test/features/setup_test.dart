import 'dart:convert';
import 'dart:io';

import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:portfolio_builder/app/providers.dart';
import 'package:portfolio_builder/core/js/pb_bridge.dart';
import 'package:portfolio_builder/features/dashboard/project_repository.dart';
import 'package:portfolio_builder/features/setup/setup_page.dart';
import 'package:portfolio_builder/features/setup/steps/review_step.dart';
import 'package:portfolio_builder/models/generated/models.dart';

import '../helpers.dart';

/// Keeps drafts in memory and returns a real default spec.
class FakePb implements PbBridge {
  final drafts = <String, Map<String, dynamic>>{};
  final specRequests = <(String, String?)>[];

  @override
  bool get available => true;

  @override
  Future<String> defaultSpec(String profileType, [String? presetId]) async {
    specRequests.add((profileType, presetId));
    return File('test/fixtures/spec_developer.json').readAsStringSync();
  }

  @override
  Future<PbResult> invoke(
    String namespace,
    String method, [
    List<Object?> args = const [],
  ]) async {
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
    return const PbResult.error('unavailable', 'Not in tests.');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.physicalSize = const Size(
      1280,
      2400,
    );
    binding.platformDispatcher.views.first.devicePixelRatio = 1;
  });

  ProjectDoc draft({String name = ''}) {
    final t = loadTemplates();
    final content = jsonDecode(jsonEncode(t.content)) as Map<String, dynamic>;
    (content['profile'] as Map)['name'] = name;
    return ProjectDoc.fromJson({
      'ownerId': 'alice',
      'name': 'Jane',
      'profileType': 'developer',
      'status': 'draft',
      'goals': t.goals,
      'content': content,
      'custom': t.custom,
      'contactForm': t.contactForm,
      'revision': 0,
      'createdAt': 1,
      'updatedAt': 1,
    });
  }

  test('only a name is required before creating the site', () {
    expect(
      reviewItems(draft()).where((i) => i.required && !i.done),
      hasLength(1),
    );
    expect(
      reviewItems(draft(name: 'Jane')).where((i) => i.required && !i.done),
      isEmpty,
    );
  });

  test('each tone starts from a matching preset', () {
    expect({
      for (final t in Tone.values) presetForTone(t),
    }, hasLength(Tone.values.length));
  });

  testWidgets('wizard: fill in a name, pick a tone, create the site', (
    tester,
  ) async {
    final db = FakeFirebaseFirestore();
    final pb = FakePb();
    final repo = ProjectRepository(db, loadTemplates());
    await tester.runAsync(
      () => db.doc('projects/p1').set(draft().toJson()..remove('spec')),
    );

    final router = GoRouter(
      initialLocation: '/p/p1/setup?step=content',
      routes: [
        GoRoute(path: '/p/:id', builder: (_, _) => const Text('PREVIEW')),
        GoRoute(
          path: '/p/:id/setup',
          builder: (_, s) => SetupPage(
            projectId: s.pathParameters['id']!,
            step: SetupStep.parse(s.uri.queryParameters['step']),
          ),
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          templatesProvider.overrideWithValue(loadTemplates()),
          pbBridgeProvider.overrideWithValue(pb),
          projectRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();

    // Content: type a name (saved on this device after a short pause).
    await tester.enterText(
      find.descendant(
        of: find.byKey(const Key('profile-name')),
        matching: find.byType(TextField),
      ),
      'Jane Doe',
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(pb.drafts['p1']?['data']['content']['profile']['name'], 'Jane Doe');

    // Goals: pick a tone.
    await tester.tap(find.byKey(const Key('step-goals')));
    await tester.pumpAndSettle();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('tone-BOLD')));
    await tester.pump();

    // Review: create.
    await tester.tap(find.byKey(const Key('step-review')));
    await tester.pumpAndSettle();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('create-site')));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pumpAndSettle();

    expect(find.text('PREVIEW'), findsOneWidget);
    expect(pb.specRequests.last, ('developer', 'bold'));
    final saved = await tester.runAsync(() => repo.get('p1'));
    expect(saved!.doc.status, ProjectStatus.EDITING);
    expect(saved.doc.spec, isNotNull);
    expect(saved.doc.content.profile.name, 'Jane Doe');
    expect(saved.doc.goals.tone, Tone.BOLD);
    expect(pb.drafts, isEmpty);
  });
}
