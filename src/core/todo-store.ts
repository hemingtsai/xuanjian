import { newUUID } from "./session"

export interface TodoItem {
  id: string
  task: string
  status: "todo" | "in_progress" | "done"
  milestone?: string
}

export interface ReviewFeedEntry {
  id: string
  time: number
  source: string
  report: string
}

/** 面板共享的待办与审查记录：agent 的 todowrite / goal 任务 / 审查流水线写入，TUI 右侧面板订阅渲染 */
export class TodoStore {
  private _items: TodoItem[] = []
  private _reviews: ReviewFeedEntry[] = []
  private readonly listeners = new Set<() => void>()

  /** 订阅变更，返回退订函数（供 TUI 桥接响应式渲染） */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  items(): TodoItem[] {
    return this._items
  }

  reviews(): ReviewFeedEntry[] {
    return this._reviews
  }

  /** 当前正在执行的 todo（状态为 in_progress 的首项） */
  current(): TodoItem | undefined {
    return this._items.find((i) => i.status === "in_progress")
  }

  setItems(items: TodoItem[]): void {
    this._items = items
    this.emit()
  }

  setCurrent(id: string | null): void {
    this._items = this._items.map((i) =>
      i.id === id
        ? { ...i, status: "in_progress" as const }
        : i.status === "in_progress"
          ? { ...i, status: "todo" as const }
          : i,
    )
    this.emit()
  }

  /** 追加一条用户信息为待办，并置为当前进行中 */
  addTask(task: string): TodoItem {
    const item: TodoItem = { id: newUUID(), task, status: "in_progress" }
    this._items = [...this._items.map((i) => (i.status === "in_progress" ? { ...i, status: "todo" as const } : i)), item]
    this.emit()
    return item
  }

  patchStatus(id: string, status: TodoItem["status"]): void {
    this._items = this._items.map((i) => (i.id === id ? { ...i, status } : i))
    this.emit()
  }

  latestReview(): ReviewFeedEntry | undefined {
    return this._reviews.length > 0 ? this._reviews[this._reviews.length - 1] : undefined
  }

  addReview(source: string, report: string): void {
    if (!report) return
    this._reviews = [...this._reviews, { id: newUUID(), time: Date.now(), source, report }]
    this.emit()
  }

  /** 审查发现问题时，将修正任务插入到当前正在执行 todo 的下一个；无正在执行任务时追加到末尾。返回插入数量 */
  insertFixTasks(tasks: { task: string; milestone?: string }[]): number {
    if (tasks.length === 0) return 0
    const current = this.current()
    const at = current ? this._items.indexOf(current) + 1 : this._items.length
    const fixes: TodoItem[] = tasks.map((t) => ({
      id: newUUID(),
      task: t.task,
      status: "todo" as const,
      milestone: t.milestone ?? "review-fix",
    }))
    this._items = [...this._items.slice(0, at), ...fixes, ...this._items.slice(at)]
    this.emit()
    return fixes.length
  }
}
