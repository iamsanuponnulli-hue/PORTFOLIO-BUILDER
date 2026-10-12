// Import limits directly: the full schema (zod) belongs in the worker, not the page bundle.
import { LIMITS } from '@pb/schema/limits';
import { previewDocument } from '@pb/renderer';
import { client, type Port } from './rpc.ts';

/**
 * Everything the Flutter app calls lives on window.pb. Dart reaches it through
 * dart:js_interop (see app/lib/core/js/pb_bridge.dart).
 */
function createBridge(scriptSrc: string) {
  let call: ReturnType<typeof client> | undefined;
  const workerCall = <T>(method: string, ...args: unknown[]) => {
    // The worker starts on first use, from the folder this script was loaded from.
    call ??= client(new Worker(new URL('pb.worker.js', scriptSrc)) as unknown as Port);
    return call<T>(method, ...args);
  };

  return {
    version: '0.1.0',
    limits: LIMITS,
    ping: () => 'pong',
    worker: {
      ping: () => workerCall<string>('ping'),
      /** Returns normalised content as a JSON string (simplest type to pass to Dart). */
      normalizeContent: async (json: string) =>
        JSON.stringify(await workerCall('normalizeContent', JSON.parse(json))),
      busyWork: (ms: number) => workerCall<boolean>('busyWork', ms),
      // JSON strings in and out: the simplest types to pass to and from Dart.
      defaultSpec: async (profileType: string, presetId?: string) =>
        JSON.stringify(await workerCall('defaultSpec', profileType, presetId)),
      applyOperations: async (stateJson: string, opsJson: string) =>
        JSON.stringify(
          await workerCall('applyOperations', JSON.parse(stateJson), JSON.parse(opsJson)),
        ),
      render: async (stateJson: string, optionsJson: string) =>
        JSON.stringify(await workerCall('render', JSON.parse(stateJson), JSON.parse(optionsJson))),
    },
    /** Builds the single HTML document shown in the sandboxed preview iframe. */
    previewDocument: (filesJson: string, page?: string) =>
      previewDocument(JSON.parse(filesJson), page),
  };
}

// document.currentScript is only set while this file is first executing.
const scriptSrc = (document.currentScript as HTMLScriptElement | null)?.src ?? location.href;
(window as unknown as { pb: ReturnType<typeof createBridge> }).pb = createBridge(scriptSrc);
