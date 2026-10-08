/**
 * Knowledge System — Compréhension avancée du projet
 *
 * Ce module ajoute à Leanna une capacité de compréhension profonde du projet :
 * - ProjectIndexer : scanne tous les fichiers et extrait les entités de code
 * - KnowledgeGraph : graphe permanent des connaissances du projet (persisté)
 * - ASTParser       : moteur Tree-sitter pour l'analyse syntaxique complète
 * - ASTCallGraph    : graphe d'appels inter et intra fichiers
 * - DependencyGraph : graphe orienté des dépendances entre fichiers
 * - ProjectMemory : mémoire projet dédiée (architecture, conventions, décisions)
 * - SemanticSearch : recherche sémantique dans le codebase
 *
 * Architecture :
 *   ProjectIndexer → ASTParser (Tree-sitter) → ASTCallGraph
 *                  → KnowledgeGraph → .project-knowledge.json
 *                                      ↓
 *   DependencyGraph ← KnowledgeGraph  ↓
 *   ImpactAnalyzer  ← DependencyGraph ↓
 *   SemanticSearch  ← KnowledgeGraph  ↓
 *   ReasoningPipeline ← SemanticSearch + ProjectMemory
 */

// Sprint 1 — ProjectIndexer + KnowledgeGraph
export { ProjectIndexer, projectIndexer } from "./ProjectIndexer.js";
export { KnowledgeGraph, knowledgeGraph } from "./KnowledgeGraph.js";

// Activation unifiée du Knowledge System (scan + watchers + extraction docs).
// Source de vérité unique partagée par le démarrage et la connexion de workspace.
export { activateProjectKnowledge, type ActivateProjectOptions } from "./activateProject.js";

// AST Engine — Tree-sitter (WASM) + Call-graph
export { ASTParser, astParser } from "./ASTParser.js";
export {
  ASTCallGraph,
  astCallGraph,
  type CallNode,
  type CallEdge,
  type CallChain,
} from "./ASTCallGraph.js";

// File Watcher — Indexation incrémentale
export { FileWatcher, fileWatcher, type FileChangeEvent, type FileChangeType, type FileChangeHandler } from "./FileWatcher.js";

// Relation Extractor — Relations sémantiques entre entités
export { RelationExtractor, relationExtractor } from "./RelationExtractor.js";

// Types
export type {
  CodeEntity,
  CodeEntityType,
  FileNode,
  KnowledgeGraphState,
  KnowledgeStats,
  DependencyCycle,
  ImpactReport,
  ProjectFact,
  ProjectKnowledgeCategory,
  ProjectContext,
  RelevantFile,
  RelevantSection,
  ContextBatch,
  UnderstandingScore,
  Lesson,
  LearningResult,
  ReasoningResult,
  ReasoningStep,
  StepResult,
  PipelineContext,
  EntityRelation,
  EntityRelationType,
  // Types AST (Tree-sitter)
  ASTFileResult,
  ASTFunction,
  ASTClass,
  ASTCall,
  ASTParam,
} from "./types.js";

// Sprint 2 — DependencyGraph
export { DependencyGraph, dependencyGraph } from "./DependencyGraph.js";

// Sprint 3 — ProjectMemory
export { ProjectMemory, projectMemory } from "./ProjectMemory.js";

// Sprint 4 — SemanticSearch
export { SemanticSearch, semanticSearch } from "./SemanticSearch.js";

// Sprint 5 — ReasoningPipeline
export { ReasoningPipeline, reasoningPipeline } from "./ReasoningPipeline.js";

// Sprint 7 — ImpactAnalyzer
export {
  ImpactAnalyzer,
  impactAnalyzer,
  type ImpactMode,
  type RiskLevel,
  type ImpactedFile,
  type TestRecommendation,
  type ExtendedImpactReport,
  type ImpactAnalysisOptions,
} from "./ImpactAnalyzer.js";

// Sprint 8 — PlanningEngine
export {
  PlanningEngine,
  planningEngine,
  type PlanningStrategy,
  type PlanningRiskMode,
  type PlanningStep,
  type ParallelWave,
  type StructuredPlan,
  type PlanningOptions,
} from "./PlanningEngine.js";

// Sprint 9 — UnderstandingEngine
export {
  UnderstandingEngine,
  understandingEngine,
  type ContextStrategy,
  type ContextDetailLevel,
  type MissingAction,
  type ContextualRecommendation,
  type KnowledgeHealth,
  type UnderstandingContext,
  type BuildContextOptions,
} from "./UnderstandingEngine.js";

// Sprint 10 — LearningEngine
export {
  LearningEngine,
  learningEngine,
  type LearningMode,
  type DetectedPattern,
  type AutoImprovement,
  type LearningOptions,
  type MissionLearningInput,
} from "./LearningEngine.js";

// Sprint 11 — DocumentStore (analyse inter-documents)
export {
  DocumentStore,
  getDocumentStore,
  type StoredDocument,
  type DocumentLink,
  type DocumentStoreData,
} from "./DocumentStore.js";

// Sprint 12 — WorkspaceIndexer (extraction automatique des documents du workspace)
export {
  WorkspaceIndexer,
  workspaceIndexer,
  type ExtractedDocument,
  type DocumentSection,
  type DocumentMetadata,
  type ExtractionStats,
} from "./WorkspaceIndexer.js";


// Playbooks appris automatiquement (P0) — stratégies réutilisables par classe de problème
export {
  PlaybookStore,
  playbookStore,
  type Playbook,
  type PlaybookStep,
  type PlaybookMissionInput,
} from "./PlaybookStore.js";

// Project Intelligence Profile (P0) — le cerveau par projet (stack, commandes, stratégies)
export {
  ProjectProfile,
  projectProfile,
  type ProjectIntelligenceProfile,
  type DetectedStack,
  type StrategyInsight,
  type KnowledgeSummary,
  type PackageManager,
} from "./ProjectProfile.js";

// AI Project Doctor (P0) — diagnostic santé projet + génération de missions d'amélioration
export {
  ProjectDoctor,
  projectDoctor,
  type HealthReport,
  type HealthDimension,
  type HealthIssue,
  type IssueSeverity,
  type ImprovementMissionRequest,
  type SecuritySignal,
  type ProjectDoctorOptions,
} from "./ProjectDoctor.js";

// Predictive Agent (P1) — prédiction pré-vol (succès, risques, stratégie, étape fragile)
export {
  PredictionEngine,
  predictionEngine,
  type PredictionReport,
  type StepPrediction,
  type PredictionRisk,
  type PredictInput,
  type PredictionEstimate,
  type PredictionEngineOptions,
} from "./PredictionEngine.js";

// Opportunity Engine (P1) — recherche proactive de travail utile (automatisations, optims, risques)
export {
  OpportunityEngine,
  opportunityEngine,
  type Opportunity,
  type OpportunityKind,
  type OpportunityReport,
  type OpportunityEngineOptions,
} from "./OpportunityEngine.js";

// Mission Evolution (#6) — apprentissage de la meilleure APPROCHE par classe de problème
export {
  MissionEvolutionStore,
  missionEvolutionStore,
  approachIdFromSteps,
  type ApproachRecord,
  type ProblemEvolution,
  type ApproachRecommendation,
} from "./MissionEvolution.js";

// Daily AI Briefing (#13) — digest matinal composé (santé + opportunités + profil)
export {
  DailyBriefing,
  dailyBriefing,
  type BriefingReport,
  type BriefingItem,
  type BriefingSeverity,
  type RecommendedMission,
  type DailyBriefingOptions,
} from "./DailyBriefing.js";

// NL → Automation (#15) — compilateur langage naturel → workflow agentique
export {
  WorkflowCompiler,
  workflowCompiler,
  type CompiledWorkflow,
  type CompiledStep,
  type CompileResult,
  type WorkflowCompilerOptions,
} from "./WorkflowCompiler.js";

// Voice Agent (#12) — interprète de commandes vocales (transcription → commandes agentiques)
export {
  VoiceCommandInterpreter,
  voiceCommandInterpreter,
  INTENT_SKILL,
  type VoiceIntent,
  type VoiceCommand,
  type VoiceTarget,
  type VoiceInterpretation,
  type VoiceInterpreterOptions,
} from "./VoiceCommandInterpreter.js";
