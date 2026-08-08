import { For, createEffect, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard, useRenderer } from "@opentui/solid"
import type { TuiController } from "./controller"
import type { OutputPart } from "./parts"
import type { StatusInfo } from "./status"
import type { ReviewFeedEntry, TodoItem } from "../core/todo-store"

const PANEL_WIDTH = 30

export function App(props: { controller: TuiController }): JSX.Element {
  const controller = props.controller
  const [input, setInput] = createSignal("")
  let scrollRef: { scrollTop: number } | undefined
  const renderer = useRenderer()
  controller.clipboard = (text) => renderer.copyToClipboardOSC52(text)

  const copySelection = (): void => {
    const selection = renderer.getSelection()
    const text = selection?.getSelectedText() ?? controller.lastAssistantText()
    controller.out.push({ type: "system", text: controller.copy(text) })
  }

  useKeyboard((e) => {
    if (e.ctrl && e.shift && e.name === "c") {
      copySelection()
      e.preventDefault()
      return
    }
    if (e.super && e.name === "c" && !e.ctrl) {
      copySelection()
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "c") {
      e.preventDefault()
      if (controller.busy()) controller.interrupt()
      else controller.exit()
      return
    }
    if (e.ctrl && e.name === "l") {
      controller.clearOutput()
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "o") {
      void controller.openAuthWizard()
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "t") {
      controller.cyclePanelTab()
      e.preventDefault()
      return
    }
    if (e.name === "pageup" && scrollRef) {
      scrollRef.scrollTop = Math.max(0, scrollRef.scrollTop - 5)
      e.preventDefault()
      return
    }
    if (e.name === "pagedown" && scrollRef) {
      scrollRef.scrollTop += 5
      e.preventDefault()
      return
    }
  })

  const submit = (value: string) => {
    if (!value.trim()) return
    setInput("")
    void controller
      .submit(value)
      .catch((err: unknown) => {
        controller.out.push({ type: "error", text: err instanceof Error ? err.message : String(err) })
      })
  }

  createEffect(() => {
    void controller.out.parts()
    if (scrollRef) scrollRef.scrollTop = Number.MAX_SAFE_INTEGER
  })

  return (
    <box flexDirection="row" flexGrow={1} flexShrink={1} width="100%" height="100%">
      <box flexDirection="column" flexGrow={1} flexShrink={1}>
        <scrollbox
          ref={(el) => {
            scrollRef = el as unknown as { scrollTop: number }
          }}
          flexGrow={1}
          flexShrink={1}
          paddingX={1}
        >
          <For each={controller.out.parts()}>
            {(part) => <PartView part={part} />}
          </For>
        </scrollbox>

        {controller.needsOnboarding() ? (
          <box flexShrink={0} paddingX={1} backgroundColor="#3b2f2f">
            <text fg="#fbbf24">尚未连接任何 provider — 按 C-o 或输入 /auth 连接</text>
          </box>
        ) : null}

        <box flexShrink={0} paddingX={1}>
          <input
            focused
            value={input()}
            onChange={(v) => setInput(v)}
            onSubmit={(v) => submit(typeof v === "string" ? v : "")}
            onKeyDown={(e) => {
              if (e.name === "up") {
                const h = controller.historyPrev()
                if (h !== undefined) {
                  setInput(h)
                  e.preventDefault()
                }
              } else if (e.name === "down") {
                const h = controller.historyNext()
                if (h !== undefined) {
                  setInput(h)
                  e.preventDefault()
                }
              }
            }}
          />
        </box>

        <StatusBar status={controller.status()} />
      </box>

      <RightPanel controller={controller} />
    </box>
  )
}

export function RightPanel(props: { controller: TuiController }): JSX.Element {
  const tab = props.controller.panelTab
  const items = props.controller.todosItems
  const reviews = props.controller.todosReviews
  return (
    <box flexShrink={0} width={PANEL_WIDTH} flexDirection="column" borderStyle="single" borderColor="#334155">
      <box flexShrink={0} paddingX={1}>
        <text fg="#7dd3fc">{tab() === "todos" ? "待办清单" : "审查输出"}</text>
      </box>
      <scrollbox flexGrow={1} flexShrink={1} paddingX={1}>
        {tab() === "todos" ? <TodoListView items={items} /> : <ReviewFeedView reviews={reviews} />}
      </scrollbox>
      <box flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <TabChip label="待办" active={tab() === "todos"} />
        <TabChip label="审查" active={tab() === "review"} />
      </box>
      <box flexShrink={0} justifyContent="flex-end" paddingX={1}>
        <text fg="#475569">Ctrl-T 切换</text>
      </box>
    </box>
  )
}

function TabChip(props: { label: string; active: boolean }): JSX.Element {
  return (
    <box backgroundColor={props.active ? "#334155" : undefined}>
      <text fg={props.active ? "#e2e8f0" : "#64748b"}>{` ${props.label} `}</text>
    </box>
  )
}

function TodoListView(props: { items: Accessor<TodoItem[]> }): JSX.Element {
  const items = props.items()
  if (items.length === 0) return <text fg="#64748b">（暂无待办）</text>
  return (
    <box flexDirection="column">
      <For each={items}>
        {(item) => {
          const active = item.status === "in_progress"
          const done = item.status === "done"
          const marker = active ? "◉" : done ? "✓" : "○"
          return (
            <box paddingY={0}>
              <text fg={active ? "#fde047" : done ? "#4ade80" : "#94a3b8"} wrapMode="word">
                {`${marker} ${item.task}`}
              </text>
            </box>
          )
        }}
      </For>
    </box>
  )
}

function ReviewFeedView(props: { reviews: Accessor<ReviewFeedEntry[]> }): JSX.Element {
  const all = props.reviews()
  const latest = all.length > 0 ? all[all.length - 1] : undefined
  if (!latest) return <text fg="#64748b">（暂无审查记录 — 运行 /review 触发）</text>
  return (
    <box flexDirection="column">
      <text fg="#a78bfa">{`${latest.source} · ${new Date(latest.time).toLocaleTimeString()}`}</text>
      <text fg="#cbd5e1" wrapMode="word">
        {latest.report}
      </text>
    </box>
  )
}

export function PartView(props: { part: OutputPart }): JSX.Element {
  const part = props.part
  switch (part.type) {
    case "banner":
      return (
        <box paddingBottom={1} flexDirection="column">
          <For each={part.leading}>
            {(_, i) => (
              <box flexDirection="row">
                <text fg="#64748b">{part.leading[i()]}</text>
                <text fg="#e2e8f0">{part.main[i()]}</text>
              </box>
            )}
          </For>
          <text fg="#94a3b8">{part.title}</text>
        </box>
      )
    case "user":
      return (
        <box paddingY={0}>
          <text fg="#7dd3fc">❯ {part.text}</text>
        </box>
      )
    case "text":
      return (
        <box>
          <text wrapMode="word">{part.text}</text>
        </box>
      )
    case "reasoning":
      return (
        <box>
        <text fg="#64748b">{part.text}</text>
      </box>
    )
    case "tool":
      return (
        <box paddingY={0} flexDirection="row">
          <text fg="#22d3ee">{part.tool} </text>
          <text fg="#475569">{part.args}</text>
        </box>
      )
    case "tool-result":
      return (
        <box paddingBottom={1} flexDirection="column">
          <text fg="#4ade80">✓ {part.title}</text>
          {part.diff ? <diff diff={part.diff} showLineNumbers wrapMode="word" /> : null}
          {part.content && !part.diff ? (
            <box borderStyle="rounded" borderColor="#334155" paddingX={1} backgroundColor="#0f172a">
              <text wrapMode="word">{part.content}</text>
            </box>
          ) : null}
          {!part.diff && !part.content ? <text fg="#94a3b8">{part.output}</text> : null}
        </box>
      )
    case "error":
      return (
        <box>
          <text fg="#f87171">✗ {part.text}</text>
        </box>
      )
    case "system":
      return (
        <box>
          <text fg="#94a3b8">{part.text}</text>
        </box>
      )
    case "assistant":
      return (
        <box>
          <text wrapMode="word">{part.text}</text>
        </box>
      )
  }
}

export function StatusBar(props: { status: StatusInfo }): JSX.Element {
  const s = props.status
  return (
    <box flexShrink={0} paddingX={1} borderStyle="single" borderColor="#334155" flexDirection="row">
      <text fg="#94a3b8">模型:{s.model} </text>
      <text fg="#94a3b8">agent:{s.agent} </text>
      <text fg="#94a3b8">模式:{s.mode} </text>
      <text fg="#94a3b8">工作区:{s.workspace} </text>
      <text fg="#22d3ee">LSP:{s.lsp} </text>
      <text fg="#a78bfa">DAP:{s.dap} </text>
      <text fg="#94a3b8">ctx:{s.ctx}</text>
    </box>
  )
}
