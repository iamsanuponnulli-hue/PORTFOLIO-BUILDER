import { serve, type Port } from './rpc.ts';
import { workerHandlers } from './handlers.ts';

serve(self as unknown as Port, workerHandlers);
