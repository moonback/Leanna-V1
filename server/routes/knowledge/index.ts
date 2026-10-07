export { default as knowledgeRouter } from "./knowledgeRouter.js";
export { default as memoryRouter } from "./memoryRouter.js";
export { default as impactRouter } from "./impactRouter.js";
export { default as understandingRouter } from "./understandingRouter.js";
export { default as insightsRouter } from "./insightsRouter.js";

import type { Router } from "express";
import knowledgeRouter_ from "./knowledgeRouter.js";
import memoryRouter_ from "./memoryRouter.js";
import impactRouter_ from "./impactRouter.js";
import understandingRouter_ from "./understandingRouter.js";
import insightsRouter_ from "./insightsRouter.js";

export function createKnowledgeRoutes(): Router[] {
  return [knowledgeRouter_, memoryRouter_, impactRouter_, understandingRouter_, insightsRouter_];
}
