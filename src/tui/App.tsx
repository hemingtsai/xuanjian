import { For, createEffect, createSignal } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { TuiController } from "./controller"
import type { OutputPart } from "./parts"
import type { StatusInfo } from "./status"
import { TextInput } from "./TextInput"

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
      else if (controller.modal()) controller.cancelModal()
      else controller.exit()
      return
    }
    if (e.ctrl && e.name === "l") {
      controller.clearOutput()
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "o") {
      if (!controller.modal()) void controller.openAuthWizard()
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
    <box flexDirection="column" flexGrow={1} flexShrink={1} width="100%" height="100%">
      {controller.modal() ? null : (
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
      )}

      {controller.modal() ? (
        <box flexGrow={1} flexShrink={1} width="100%" flexDirection="column" alignItems="center" justifyContent="center" backgroundColor="#0a0e14">
          <ModalView controller={controller} modal={controller.modal()!} />
        </box>
      ) : null}

      {controller.needsOnboarding() ? (
        <box flexShrink={0} paddingX={1} backgroundColor="#3b2f2f">
          <text fg="#fbbf24">🔑 尚未连接任何 provider — 按 C-o 或输入 /auth 连接</text>
        </box>
      ) : null}

      <box flexShrink={0} paddingX={1}>
        <TextInput
          value={input()}
          onChange={(v) => setInput(v)}
          onSubmit={(v) => submit(v)}
          active={!controller.modal()}
          onHistoryPrev={() => controller.historyPrev()}
          onHistoryNext={() => controller.historyNext()}
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

function ModalView(props: { controller: TuiController; modal: { kind: string } & Record<string, unknown> }): JSX.Element {
  const modal = props.modal
  const dims = useTerminalDimensions()
  const width = Math.min(dims().width - 4, 60)

  if (modal.kind === "select") {
    const options = (modal.options as { name: string; description: string; value: string }[]) ?? []
    const selectHeight = Math.min(Math.max(options.length, 3) * 2, 10)
    const boxHeight = selectHeight + 3
    return (
      <box flexShrink={0} width={width} height={boxHeight} backgroundColor="#1e293b" borderStyle="rounded" borderColor="#475569" flexDirection="column" paddingX={1}>
        <text fg="#fde047">◈ {String(modal.title)}（↑↓ 选择 · Enter 确认 · Esc/Ctrl-C 取消）</text>
        <select
          flexGrow={1}
          width="100%"
          height={selectHeight}
          focused
          options={options}
          showDescription
          showSelectionIndicator
          onSelect={(_, opt) => props.controller.resolveModal(opt?.value)}
        />
      </box>
    )
  }
  const isPermission = modal.kind === "permission"
  const [value, setValue] = createSignal("")

  return (
    <box flexShrink={0} width={width} height={4} flexDirection="column" paddingX={1} backgroundColor="#1e293b" borderStyle="rounded" borderColor="#475569">
      <text fg="#fde047">⚠ {String(modal.text)}</text>
      <TextInput
        value={value()}
        onChange={(v) => setValue(v)}
        onSubmit={(v) => {
          if (isPermission) {
            const a = v.toLowerCase()
            props.controller.resolveModal(a === "y" ? "allow" : a === "n" ? "deny" : a === "a" ? "session" : a === "s" ? "always" : "deny")
          } else {
            props.controller.resolveModal(v)
          }
        }}
        active
        oneChar={isPermission}
        onChar={(ch) => {
          const a = ch.toLowerCase()
          props.controller.resolveModal(a === "y" ? "allow" : a === "n" ? "deny" : a === "a" ? "session" : a === "s" ? "always" : "deny")
        }}
        placeholder={isPermission ? "y=允许 n=拒绝 a=会话 s=总是" : "回答（Enter 提交）"}
      />
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
