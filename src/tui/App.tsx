import { For, createEffect, createSignal } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard } from "@opentui/solid"
import type { TuiController } from "./controller"
import type { OutputPart } from "./parts"
import type { StatusInfo } from "./status"

export function App(props: { controller: TuiController }): JSX.Element {
  const controller = props.controller
  const [input, setInput] = createSignal("")
  let scrollRef: { scrollTop: number } | undefined

  useKeyboard((e) => {
    if (e.ctrl && e.name === "c") {
      e.preventDefault()
      if (controller.busy()) controller.interrupt()
      else if (controller.modal()) controller.cancelModal()
      else controller.exit()
      return
    }
    if (e.ctrl && e.name === "l") {
      controller.clearOutput()
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
    if (e.name === "escape" && controller.modal()) {
      controller.cancelModal()
      e.preventDefault()
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

      {controller.modal() ? (
        <ModalView controller={controller} text={controller.modal()!.text} kind={controller.modal()!.kind} />
      ) : null}

      <box flexShrink={0} paddingX={1}>
        <input
          focused={!controller.modal()}
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
          placeholder="输入消息，/help 查看命令"
        />
      </box>

      <StatusBar status={controller.status()} />
    </box>
  )
}

export function PartView(props: { part: OutputPart }): JSX.Element {
  const part = props.part
  switch (part.type) {
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
          <text fg="#64748b">🧠 {part.text}</text>
        </box>
      )
    case "tool":
      return (
        <box paddingY={0} flexDirection="row">
          <text fg="#22d3ee">⚙ {part.tool} </text>
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

function ModalView(props: { controller: TuiController; text: string; kind: "permission" | "ask" }): JSX.Element {
  const [value, setValue] = createSignal("")
  const isPermission = props.kind === "permission"

  return (
    <box flexShrink={0} paddingX={1} backgroundColor="#1e293b" borderStyle="rounded" borderColor="#475569">
      <box flexDirection="column">
        <text fg="#fde047">⚠ {props.text}</text>
        <input
          focused
          value={value()}
          maxLength={isPermission ? 1 : undefined}
          onChange={(v) => setValue(v)}
          onKeyDown={(e) => {
            if (e.ctrl && e.name === "c") {
              props.controller.cancelModal()
              e.preventDefault()
              return
            }
            if (isPermission && e.name.length === 1 && !e.ctrl && !e.meta && !e.option) {
              const a = e.name.toLowerCase()
              const answer = a === "y" ? "allow" : a === "n" ? "deny" : a === "a" ? "session" : a === "s" ? "always" : "deny"
              props.controller.resolveModal(answer)
              e.preventDefault()
            }
          }}
          onSubmit={(v) => {
            const value = typeof v === "string" ? v : ""
            if (isPermission) {
              const a = value.toLowerCase()
              props.controller.resolveModal(a === "y" ? "allow" : a === "n" ? "deny" : a === "a" ? "session" : a === "s" ? "always" : "deny")
            } else {
              props.controller.resolveModal(value)
            }
          }}
          placeholder={isPermission ? "y=允许 n=拒绝 a=会话 s=总是" : "回答（Enter 提交）"}
        />
      </box>
    </box>
  )
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
