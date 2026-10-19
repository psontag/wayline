import app from "./app";
import { deleteExpiredLegs } from "./legs";

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(deleteExpiredLegs(env.DB));
  },
} satisfies ExportedHandler<Env>;
