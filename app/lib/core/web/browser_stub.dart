void openExternal(String url) {}
void redirectTo(String url) {}
String currentOrigin() => 'http://localhost';

/// Calls [callback] when the page is hidden or closed. Returns a function that stops it.
void Function() onPageHidden(void Function() callback) => () {};
