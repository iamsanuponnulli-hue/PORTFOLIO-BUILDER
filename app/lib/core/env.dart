/// Build-time configuration, passed with `--dart-define` (see README).
///
/// The defaults target the local Firebase emulators with a demo project, so the
/// app runs without any real Firebase project or credentials.
class Env {
  static const firebaseProjectId = String.fromEnvironment(
    'FIREBASE_PROJECT_ID',
    defaultValue: 'demo-portfolio-builder',
  );
  static const firebaseApiKey = String.fromEnvironment(
    'FIREBASE_API_KEY',
    defaultValue: 'demo-api-key',
  );
  static const firebaseAppId = String.fromEnvironment(
    'FIREBASE_APP_ID',
    defaultValue: '1:000000000000:web:0000000000000000',
  );
  static const firebaseSenderId = String.fromEnvironment(
    'FIREBASE_SENDER_ID',
    defaultValue: '000000000000',
  );
  static const firebaseAuthDomain = String.fromEnvironment(
    'FIREBASE_AUTH_DOMAIN',
    defaultValue: 'demo-portfolio-builder.firebaseapp.com',
  );

  /// Emulators are on by default and for any `demo-*` project.
  static const useEmulators = bool.fromEnvironment(
    'USE_EMULATORS',
    defaultValue: true,
  );
  static const emulatorHost = String.fromEnvironment(
    'EMULATOR_HOST',
    defaultValue: 'localhost',
  );

  /// Where people install the companion extension (Edge Add-ons listing or a
  /// download page). Empty hides the install link; screenshot upload still works.
  static const extensionUrl = String.fromEnvironment('EXTENSION_URL');
}
