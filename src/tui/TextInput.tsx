import { createEffect, createSignal } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard, usePaste } from "@opentui/solid"

export interface TextInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  /** 是否捕获按键（无 modal 时主输入框 active=true） */
  active: boolean
  placeholder?: string
  onHistoryPrev?: () => string | undefined
  onHistoryNext?: () => string | undefined
  maxLength?: number
  /** 单字符模式（权限弹窗）：按任意字符键立即触发 */
  oneChar?: boolean
  onChar?: (ch: string) => void
}

export function TextInput(props: TextInputProps): JSX.Element {
  const [cursor, setCursor] = createSignal(props.value.length)

  createEffect(() => {
    setCursor((cur) => Math.min(cur, props.value.length))
  })

  const insert = (text: string): void => {
    const v = props.value
    const c = Math.min(cursor(), v.length)
    const next = v.slice(0, c) + text + v.slice(c)
    if (props.maxLength !== undefined && next.length > props.maxLength) return
    props.onChange(next)
    setCursor(c + text.length)
  }

  usePaste((e) => {
    if (!props.active) return
    const text = new TextDecoder()
      .decode(e.bytes)
      .replace(/\r?\n/g, " ")
      .replace(/[\x00-\x1f]/g, "")
    if (text) insert(text)
  })

  useKeyboard((e) => {
    if (!props.active) return

    if (props.oneChar) {
      if (e.ctrl && e.name === "c") return // 上层处理取消
      const ch = e.sequence || e.name
      if (!e.ctrl && !e.meta && !e.super && ch.length === 1) {
        props.onChar?.(ch)
        e.preventDefault()
      }
      return
    }

    if (e.ctrl && e.name === "c") return // 上层处理中断/退出

    // 可打印字符（用 sequence：包含大小写与符号）
    if (
      !e.ctrl && !e.meta && !e.super && !e.hyper &&
      e.sequence && e.sequence.length === 1 && e.sequence.charCodeAt(0) >= 32
    ) {
      insert(e.sequence)
      e.preventDefault()
      return
    }

    const v = props.value
    let c = cursor()

    switch (e.name) {
      case "backspace":
        if (c > 0) {
          props.onChange(v.slice(0, c - 1) + v.slice(c))
          setCursor(c - 1)
        }
        e.preventDefault()
        return
      case "delete":
        if (c < v.length) props.onChange(v.slice(0, c) + v.slice(c + 1))
        e.preventDefault()
        return
      case "left":
        setCursor(Math.max(0, c - 1))
        e.preventDefault()
        return
      case "right":
        setCursor(Math.min(v.length, c + 1))
        e.preventDefault()
        return
      case "home":
        setCursor(0)
        e.preventDefault()
        return
      case "end":
        setCursor(v.length)
        e.preventDefault()
        return
      case "up": {
        const h = props.onHistoryPrev?.()
        if (h !== undefined) {
          props.onChange(h)
          setCursor(h.length)
        }
        e.preventDefault()
        return
      }
      case "down": {
        const h = props.onHistoryNext?.()
        if (h !== undefined) {
          props.onChange(h)
          setCursor(h.length)
        }
        e.preventDefault()
        return
      }
      case "return":
        props.onSubmit(v)
        e.preventDefault()
        return
    }

    if (e.ctrl && e.name === "a") {
      setCursor(0)
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "e") {
      setCursor(v.length)
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "u") {
      props.onChange("")
      setCursor(0)
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "k") {
      props.onChange(v.slice(0, c))
      e.preventDefault()
      return
    }
    if (e.ctrl && e.name === "w") {
      let i = c
      while (i > 0 && v[i - 1] === " ") i--
      while (i > 0 && v[i - 1] !== " ") i--
      props.onChange(v.slice(0, i) + v.slice(c))
      setCursor(i)
      e.preventDefault()
      return
    }
  })

  const v = props.value
  const c = Math.min(cursor(), v.length)
  const before = v.slice(0, c)
  const at = v[c] ?? ""
  const after = v.slice(c + 1)

  return (
    <box flexDirection="row" width="100%" flexShrink={0}>
      <text wrapMode="none">{before}</text>
      <box width={1} backgroundColor="#e2e8f0">
        <text fg="#0f172a">{at || " "}</text>
      </box>
      <text wrapMode="none">{after}</text>
      {v.length === 0 && props.placeholder ? <text fg="#64748b">{props.placeholder}</text> : null}
    </box>
  )
}
