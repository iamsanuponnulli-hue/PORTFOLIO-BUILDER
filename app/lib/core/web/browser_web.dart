import 'package:web/web.dart' as web;

/// Opens a link in a new tab without giving it access to this page.
void openExternal(String url) =>
    web.window.open(url, '_blank', 'noopener,noreferrer');

/// Leaves the app for another site (e.g. OpenRouter sign-in).
void redirectTo(String url) => web.window.location.assign(url);

String currentOrigin() => web.window.location.origin;

/// Calls [callback] when the page is hidden or closed (tab switched, window
/// closed, reload). Returns a function that stops listening.
void Function() onPageHidden(void Function() callback) {
  final hidden = web.CustomEventProviders.visibilityChangeEvent
      .forTarget(web.document)
      .listen((_) {
        if (web.document.visibilityState == 'hidden') callback();
      });
  final hide = web.EventStreamProviders.pageHideEvent
      .forTarget(web.window)
      .listen((_) => callback());
  return () {
    hidden.cancel();
    hide.cancel();
  };
}
