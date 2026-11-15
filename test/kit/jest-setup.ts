import "reflect-metadata";
import { standinEnv } from "./env";

// Every spec starts from the stand-in environment; a spec may change process.env for itself.
for (const [k, v] of Object.entries(standinEnv())) {
  if (process.env[k] === undefined || k === "PROVIDERS" || k === "NODE_ENV") process.env[k] = v;
}
