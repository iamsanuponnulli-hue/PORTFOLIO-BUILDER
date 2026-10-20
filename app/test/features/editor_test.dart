import 'dart:convert';
import 'dart:io';

import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:portfolio_builder/app/providers.dart';
import 'package:portfolio_builder/core/js/pb_bridge.dart';
import 'package:portfolio_builder/features/dashboard/project_repository.dart';
import 'package:portfolio_builder/features/design/directions_page.dart';
import 'package:portfolio_builder/features/editor/catalog.dart';
import 'package:portfolio_builder/features/editor/editor_controller.dart';
import 'package:portfolio_builder/features/editor/editor_page.dart';
import 'package:portfolio_builder/features/project/drafts.dart';
import 'package:portfolio_builder/features/project/project_session.dart';
import 'package:portfolio_builder/features/score/score.dart';
import 'package:portfolio_builder/features/setup/content_ai.dart';
import 'package:portfolio_builder/features/versions/version_repository.dart';
import 'package:portfolio_builder/models/generated/models.dart';

import '../fake_pb.dart';
import '../helpers.dart';

Map<String, dynamic> projectJson({String name = 'Jane Doe', bool spec = true}) {
  final t = loadTemplates();
  final content = jsonDecode(jsonEncode(t.content)) as Map<String, dynamic>;
  (content['profile'] as Map)['name'] = name;
  return {
    'ownerId': 'alice',
    'name': 'Jane',
    'profileType': 'developer',
    'status': spec ? 'editing' : 'draft',
    'goals': t.goals,
    'content': content,
    'custom': t.custom,
    'contactForm': t.contactForm,
    if (spec)
      'spec': jsonDecode(
        File('test/fixtures/spec_developer.json').readAsStringSync(),
      ),
    'revision': 0,
    'createdAt': 1,
    'updatedAt': 1,
  };
}

void main() {
  late FakeFirebaseFirestore db;
  late FakePb pb;
  late ProjectRepository repo;

  setUp(() async {
    db = FakeFirebaseFirestore();
    pb = FakePb();
    repo = ProjectRepository(db, loadTemplates());
    await db.doc('projects/p1').set(projectJson());
  });

  Future<(ProjectSession, EditorController)> open({
    Duration coalesce = Duration.zero,
  }) async {
    final session = ProjectSession(
      projectId: 'p1',
      repo: repo,
      drafts: BridgeDraftStore(pb),
      syncEvery: const Duration(hours: 1),
    );
    await session.load();
    final editor = EditorController(
      session: session,
      pb: pb,
      coalesce: coalesce,
      renderDelay: Duration.zero,
    );
    return (session, editor);
  }

  group('editor controller', () {
    test('applies operations, with undo and redo', () async {
      final (session, editor) = await open();
      expect(editor.canUndo, isFalse);
      await editor.apply([
        {'op': 'toggleSection', 'id': 'about'},
      ]);
      bool visible() => session.doc!.spec!.sections
          .firstWhere((s) => s.id == 'about')
          .visible;
      expect(visible(), isFalse);
      expect(editor.canUndo, isTrue);
      editor.undo();
      expect(visible(), isTrue);
      expect(editor.canRedo, isTrue);
      editor.redo();
      expect(visible(), isFalse);
      // A new change clears redo.
      editor.undo();
      await editor.apply([
        {'op': 'setVariant', 'id': 'about', 'variant': 'photo'},
      ]);
      expect(editor.canRedo, isFalse);
      editor.dispose();
    });

    test('a burst of edits (typing) is one undo step', () async {
      final (session, editor) = await open(
        coalesce: const Duration(seconds: 5),
      );
      void type(String name) => session.update(
        (d) => d.copyWith(
          content: d.content.copyWith(
            profile: d.content.profile.copyWith(name: name),
          ),
        ),
      );
      type('J');
      type('Ja');
      type('Jan');
      editor.undo();
      expect(session.doc!.content.profile.name, 'Jane Doe');
      expect(editor.canUndo, isFalse);
      editor.dispose();
    });

    test('inline edits in the preview become content operations', () async {
      final (session, editor) = await open();
      await editor.onPreviewMessage({
        'pb': 'edit',
        'target': 'content:profile.headline',
        'value': 'Engineer',
      });
      expect(session.doc!.content.profile.headline, 'Engineer');
      await editor.onPreviewMessage({
        'pb': 'edit',
        'target': 'option:projects:title',
        'value': 'Work',
      });
      expect(
        session.doc!.spec!.sections
            .firstWhere((s) => s.id == 'projects')
            .options['title'],
        'Work',
      );
      await editor.onPreviewMessage({'pb': 'select', 'id': 'skills'});
      expect(editor.selected, 'skills');
      editor.dispose();
    });

    test(
      'previews a proposal and applies it without unticked content changes',
      () async {
        final (session, editor) = await open();
        final ops = [
          {
            'op': 'updateTheme',
            'tokens': {'radius': 20},
          },
          {
            'op': 'updateContent',
            'path': 'profile.tagline',
            'value': 'Invented claim',
          },
        ];
        editor.propose(
          Proposal(
            prompt: 'rounder',
            summary: 'Rounder corners',
            operations: ops,
            changes: const ['Corner rounding: 8 → 20'],
            skipped: const [],
            contentChanges: const [1],
            state: editor.state,
          ),
        );
        expect(session.doc!.spec!.theme.radius, isNot(20));
        await editor.acceptProposal(skipContent: {1});
        expect(session.doc!.spec!.theme.radius, 20);
        expect(session.doc!.content.profile.tagline, '');
        expect(editor.proposal, isNull);
        editor.dispose();
      },
    );

    test('renders the preview with the editor script and checks', () async {
      final (_, editor) = await open();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(editor.html, '<h1>Jane Doe</h1><!--editor-->');
      expect(editor.checks, isEmpty);
      editor.dispose();
    });
  });

  group('versions', () {
    test('saves snapshots, keeps the newest, and restores', () async {
      var t = 0;
      final versions = VersionRepository(
        db,
        clock: () => DateTime.fromMillisecondsSinceEpoch(++t),
        keep: 3,
      );
      final doc = parseProject(projectJson());
      for (var i = 0; i < 5; i++) {
        await versions.save(
          'p1',
          doc.copyWith(
            content: doc.content.copyWith(
              profile: doc.content.profile.copyWith(name: 'v$i'),
            ),
          ),
          source: VersionSource.MANUAL,
          summary: 'v$i',
        );
      }
      final list = await versions.list('p1');
      expect(list.map((v) => v.doc.summary), ['v4', 'v3', 'v2']);
      final restored = restoreSnapshot(doc, list.last.doc);
      expect(restored.content.profile.name, 'v2');
      expect(restored.name, doc.name);
    });
  });

  group('projects', () {
    test('old projects without inspiration still load', () {
      final j = projectJson()..remove('inspiration');
      expect(parseProject(j).inspiration, isEmpty);
    });

    test('a backup becomes a new project', () async {
      await db.doc('users/alice').set({'projectCount': 0, 'createdAt': 1});
      final id = await repo.createFromBackup(
        uid: 'alice',
        project: {
          ...projectJson(name: 'From backup'),
          'name': 'Backed up',
        },
      );
      final saved = (await repo.get(id))!.doc;
      expect(saved.name, 'Backed up');
      expect(saved.status, ProjectStatus.EDITING);
      expect(saved.content.profile.name, 'From backup');
      expect(saved.ownerId, 'alice');
    });
  });

  test('catalog lists sections, layouts, presets and fonts', () {
    final c = Catalog.parse(pb.catalogJson());
    expect(c.library.map((s) => s.type), isNot(contains('custom')));
    expect(c.label(SectionType.HERO), 'Intro');
    expect(c.variantLabel(SectionType.PROJECTS, 'grid'), 'Card grid');
    expect(c.presets.map((p) => p.id), contains('calm'));
    expect(c.fonts.any((f) => f.category == 'mono'), isTrue);
  });

  test('score: blocking findings are content errors, not suggestions', () {
    final s = Score.fromJson({
      'total': 70,
      'categories': {'content': 50},
      'full': true,
      'findings': [
        {
          'id': 'placeholder-x',
          'category': 'content',
          'severity': 'error',
          'message': 'Fill in [X%]',
        },
        {
          'id': 'axe-image-alt',
          'category': 'accessibility',
          'severity': 'error',
          'message': 'alt',
        },
        {
          'id': 'seo-title',
          'category': 'seo',
          'severity': 'warning',
          'message': 't',
        },
      ],
    });
    expect(s.blocking.map((f) => f.id), ['placeholder-x']);
  });

  test('content paths are set inside decoded JSON', () {
    final j = {
      'experience': [
        {
          'bullets': ['a', 'b'],
        },
      ],
    };
    setJsonPath(j, ['experience', 0, 'bullets', 1], 'B');
    expect(j['experience']![0]['bullets'], ['a', 'B']);
  });

  group('pages', () {
    setUp(() {
      final binding = TestWidgetsFlutterBinding.ensureInitialized();
      binding.platformDispatcher.views.first.physicalSize = const Size(
        1440,
        1000,
      );
      binding.platformDispatcher.views.first.devicePixelRatio = 1;
    });

    Widget app(Widget child) => ProviderScope(
      overrides: [
        templatesProvider.overrideWithValue(loadTemplates()),
        pbBridgeProvider.overrideWithValue(pb),
        projectRepositoryProvider.overrideWithValue(repo),
        firestoreProvider.overrideWithValue(db),
        firebaseAuthProvider.overrideWithValue(
          MockFirebaseAuth(
            signedIn: true,
            mockUser: MockUser(uid: 'alice', isEmailVerified: true),
          ),
        ),
      ],
      child: MaterialApp.router(
        routerConfig: GoRouter(
          routes: [
            GoRoute(path: '/', builder: (_, _) => child),
            GoRoute(path: '/p/:id', builder: (_, _) => const Text('EDITOR')),
          ],
        ),
      ),
    );

    Future<void> settle(WidgetTester tester) async {
      for (var i = 0; i < 3; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 30)),
        );
        await tester.pump();
      }
    }

    testWidgets('editor: sections panel, tour, undo and code mode', (
      tester,
    ) async {
      await tester.pumpWidget(app(const EditorPage(projectId: 'p1')));
      await settle(tester);

      expect(find.byKey(const Key('tour')), findsOneWidget);
      await tester.tap(find.text('Skip'));
      await tester.pump();
      expect(pb.prefs['tour.editor'], 'done');

      expect(find.text('About'), findsWidgets);
      await tester.tap(find.byKey(const Key('toggle-about')));
      await settle(tester);
      expect(pb.appliedOps.last, {'op': 'toggleSection', 'id': 'about'});
      expect(
        find.text('About · Text · Hidden').evaluate().isNotEmpty ||
            find.textContaining('Hidden').evaluate().isNotEmpty,
        isTrue,
      );

      await tester.tap(find.byKey(const Key('undo')));
      await settle(tester);
      expect(find.textContaining('Hidden'), findsNothing);

      // Theme panel lists presets from the catalogue.
      await tester.tap(find.byKey(const Key('tab-theme')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('preset-calm')), findsOneWidget);

      // Code mode: custom.css is editable and saves as an operation.
      await tester.tap(find.text('Code'));
      await settle(tester);
      await tester.tap(find.byKey(const Key('file-assets/css/custom.css')));
      await settle(tester);
      await tester.enterText(
        find.byKey(const Key('code-editor')),
        'h1{color:red}',
      );
      await tester.tap(find.byKey(const Key('save-code')));
      await settle(tester);

      expect(pb.appliedOps.last, {
        'op': 'editCustomCode',
        'file': 'custom.css',
        'content': 'h1{color:red}',
      });
    });

    testWidgets('designs: three directions without AI, then use one', (
      tester,
    ) async {
      await db.doc('projects/p1').set(projectJson(spec: false));
      await db.doc('users/alice').set({
        'displayName': '',
        'email': '',
        'ai': {'simple': true},
        'projectCount': 1,
        'createdAt': 1,
      });
      final spec = jsonDecode(
        File('test/fixtures/spec_developer.json').readAsStringSync(),
      );
      pb.answers['site.directions'] = PbResult.ok([
        for (final n in ['Calm', 'Bold', 'Warm'])
          {'id': n, 'name': n, 'description': '', 'spec': spec},
      ]);
      // No user doc: no AI chosen.
      await tester.pumpWidget(app(const DirectionsPage(projectId: 'p1')));
      await settle(tester);
      await settle(tester);
      expect(find.text('Calm'), findsOneWidget);
      expect(find.text('Warm'), findsOneWidget);
      expect(find.byKey(const Key('connect-ai-designs')), findsOneWidget);
      await tester.tap(find.byKey(const Key('use-Bold')));
      await settle(tester);
      expect(find.text('EDITOR'), findsOneWidget);
      final saved = (await tester.runAsync(() => repo.get('p1')))!.doc;
      expect(saved.spec, isNotNull);
      expect(saved.status, ProjectStatus.EDITING);
      final versions = await tester.runAsync(
        () => VersionRepository(db).list('p1'),
      );
      expect(versions!.single.doc.summary, 'Design: Bold');
    });
  });
}
