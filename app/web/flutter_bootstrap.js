{{flutter_js}}
{{flutter_build_config}}

// Serve the rendering engine (CanvasKit) from this site rather than Google's CDN:
// no third-party script loads, which keeps a strict Content Security Policy possible.
_flutter.loader.load({
  config: { canvasKitBaseUrl: 'canvaskit/' },
});
