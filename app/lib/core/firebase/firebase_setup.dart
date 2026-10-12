import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import '../env.dart';

const _options = FirebaseOptions(
  apiKey: Env.firebaseApiKey,
  appId: Env.firebaseAppId,
  messagingSenderId: Env.firebaseSenderId,
  projectId: Env.firebaseProjectId,
  authDomain: Env.firebaseAuthDomain,
  storageBucket: Env.firebaseStorageBucket,
);

Future<void> initFirebase() async {
  await Firebase.initializeApp(options: _options);
  if (Env.useEmulators || Env.firebaseProjectId.startsWith('demo-')) {
    await FirebaseAuth.instance.useAuthEmulator(Env.emulatorHost, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(Env.emulatorHost, 8080);
  }
}
