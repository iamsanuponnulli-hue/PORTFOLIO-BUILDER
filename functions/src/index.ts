import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as v1 from 'firebase-functions/v1';
import { deleteUserData } from './cleanup.ts';
import { refund, reserve } from './quota.ts';
import { handleRelay, RelayError, type Sink } from './relay.ts';

initializeApp();

const STARTER_API_KEY = defineSecret('STARTER_API_KEY');
const STARTER_PROVIDER = defineString('STARTER_PROVIDER', { default: '' });
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS', {
  default: 'http://localhost:5000,http://localhost:8000',
});

/**
 * Starter AI relay. Requests made with a user's own key never reach this function.
 * The provider forwarder is added in Phase 2, once the Starter model is chosen.
 */
export const aiRelay = onRequest(
  {
    secrets: [STARTER_API_KEY],
    timeoutSeconds: 300,
    memory: '256MiB',
    concurrency: 80,
    maxInstances: 10,
  },
  async (req, res) => {
    // CORS is checked here (not in options) so the allowed origins can change without a redeploy.
    const origin = req.get('origin') ?? '';
    const allowed = ALLOWED_ORIGINS.value()
      .split(',')
      .map((o) => o.trim());
    if (origin && allowed.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST',
        Vary: 'Origin',
      });
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    const db = getFirestore();
    const sink: Sink = {
      start: (status, headers) => res.status(status).set(headers),
      write: (chunk) => res.write(chunk),
      end: () => res.end(),
    };
    await handleRelay(
      {
        verifyToken: async (token) => (await getAuth().verifyIdToken(token)).uid,
        reserve: (uid, kind, now) => reserve(db, uid, kind, now),
        refund: (uid, kind, now) => refund(db, uid, kind, now),
        forward: async () => {
          logger.warn('Starter provider not configured', { provider: STARTER_PROVIDER.value() });
          throw new RelayError(
            503,
            'starter_unavailable',
            'The Starter allowance is not available yet.',
          );
        },
        now: () => new Date(),
      },
      { method: req.method, authorization: req.get('authorization'), body: req.body },
      sink,
    );
  },
);

/** Guarantees cleanup after an account is deleted (the browser may be gone by then). */
export const onUserDeleted = v1.auth.user().onDelete(async (user) => {
  const n = await deleteUserData(getFirestore(), getStorage().bucket(), user.uid);
  logger.info('Deleted user data', { uid: user.uid, projects: n });
});
