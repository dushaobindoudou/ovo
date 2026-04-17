import type { PipelineLog, StageLog } from "./types.js";
import { KnowledgeGraphEngine } from "./knowledge-graph.js";
import type { ActionResult } from "./action-executor.js";

export class PipelineLogger {
  private pipelines = new Map<string, PipelineLog>();

  constructor(private readonly kg: KnowledgeGraphEngine) {}

  private id() {
    return `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  startPipeline() {
    const id = this.id();
    const record: PipelineLog = {
      id,
      timestamp: Date.now(),
      duration: 0,
      status: "running",
      stages: {}
    };
    this.pipelines.set(id, record);
    return record;
  }

  updateStage(pipelineId: string, stage: string, data: StageLog) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;
    pipeline.stages[stage] = data;
    pipeline.duration = Date.now() - pipeline.timestamp;
  }

  rateStage(pipelineId: string, stage: string, rating: "good" | "bad") {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline || !pipeline.stages[stage]) return;
    pipeline.stages[stage].rating = rating;
  }

  rateOverall(pipelineId: string, rating: "good" | "neutral" | "bad") {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;
    pipeline.overallRating = rating;
  }

  complete(pipelineId: string, status: "completed" | "failed") {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;
    pipeline.status = status;
    pipeline.duration = Date.now() - pipeline.timestamp;
    this.kg.savePipelineLog(pipeline.id, pipeline.duration, pipeline.status, pipeline.stages, pipeline.overallRating);
  }

  mergeActionsStage(pipelineId: string, mutator: (actions: ActionResult[]) => ActionResult[]) {
    const pipeline = this.pipelines.get(pipelineId);
    const stage = pipeline?.stages.actions;
    if (!pipeline || !stage?.data || typeof stage.data !== "object") return false;
    const data = stage.data as { actions?: ActionResult[] };
    const prev = [...(data.actions ?? [])];
    const next = mutator(prev);
    stage.data = { ...data, actions: next };
    pipeline.duration = Date.now() - pipeline.timestamp;
    this.kg.updatePipelineStages(
      pipeline.id,
      pipeline.duration,
      pipeline.status,
      pipeline.stages,
      pipeline.overallRating ?? null
    );
    return true;
  }

  getRecent(limit = 20) {
    return [...this.pipelines.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getById(id: string) {
    return this.pipelines.get(id) ?? null;
  }

  clear() {
    this.pipelines.clear();
  }
}
