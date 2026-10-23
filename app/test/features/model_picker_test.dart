import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:portfolio_builder/core/js/pb_bridge.dart';
import 'package:portfolio_builder/features/ai/ai_repository.dart';
import 'package:portfolio_builder/features/ai/model_picker_dialog.dart';

void main() {
  const list = ModelList([
    AiModel(id: 'pro', label: 'Pro', free: true, images: true, smart: true),
    AiModel(id: 'flash', label: 'Flash', free: true, images: true, smart: true),
  ], 'pro');

  testWidgets('a model that fails its test is not chosen', (tester) async {
    final tested = <String>[];
    String? picked;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async => picked = await showModelPicker(
              context,
              list,
              test: (id) async {
                tested.add(id);
                if (id == 'pro') {
                  throw const PbException(
                    'model_unavailable',
                    "This model isn't included in the free tier.",
                  );
                }
              },
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('use-model')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('model-error')), findsOneWidget);
    expect(picked, isNull);

    await tester.tap(find.text('Flash'));
    await tester.pump();
    expect(find.byKey(const Key('model-error')), findsNothing);
    await tester.tap(find.byKey(const Key('use-model')));
    await tester.pumpAndSettle();
    expect(picked, 'flash');
    expect(tested, ['pro', 'flash']);
  });
}
