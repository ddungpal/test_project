// Inngest 서버 엔드포인트(App Router). 로컬: `npx inngest-cli dev` + `pnpm dev` 동시 실행 → 이벤트 처리.
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client.js";
import { functions } from "../../../inngest/functions/index.js";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
