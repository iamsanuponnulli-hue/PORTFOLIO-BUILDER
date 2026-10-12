import 'package:web/web.dart' as web;

/// Opens a link in a new tab without giving it access to this page.
void openExternal(String url) =>
    web.window.open(url, '_blank', 'noopener,noreferrer');

/// Leaves the app for another site (e.g. OpenRouter sign-in).
void redirectTo(String url) => web.window.location.assign(url);

String currentOrigin() => web.window.location.origin;
