/// Reads and changes the text of a [CodeEditor].
class CodeEditorController {
  String Function()? _get;
  void Function(String text)? _set;
  void Function(int line)? _goTo;

  String get text => _get?.call() ?? '';
  set text(String value) => _set?.call(value);

  /// Moves the cursor to a 1-based line (e.g. where an error is).
  void goToLine(int line) => _goTo?.call(line);

  Object? _owner;

  /// Connects the editor widget [owner] (the newest one wins).
  void attach(
    Object owner, {
    required String Function() get,
    required void Function(String) set,
    required void Function(int) goTo,
  }) {
    _owner = owner;
    _get = get;
    _set = set;
    _goTo = goTo;
  }

  /// Disconnects [owner], unless a newer editor has already attached.
  void detach(Object owner) {
    if (!identical(_owner, owner)) return;
    _owner = null;
    _get = null;
    _set = null;
    _goTo = null;
  }
}
