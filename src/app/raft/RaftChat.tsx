'use client'

import { useState } from 'react'
import {
  ArrowUpIcon,
  CircleAlertIcon,
  FileTextIcon,
  ListIcon,
  PlugIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react'

import { Bubble, BubbleContent } from '@/components/ui/bubble'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Message, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Switch } from '@/components/ui/switch'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'

// Events streamed by raft-1's POST /api/ask/stream, one JSON object per line.
type AgentEvent =
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'progress'; message: string }
  | { type: 'tool_result'; id: string; name: string; content: string; error: boolean }
  | { type: 'done'; output: unknown }
  | { type: 'error'; message: string }

type Step = {
  id: string
  name: string
  args: Record<string, unknown>
  progress: string[]
  result?: string
  error?: boolean
  done: boolean
}

type Turn = { query: string; extended: boolean; steps: Step[]; result?: unknown; failed?: boolean }

const EXAMPLES = [
  'Show me all orders from Ohio over $500',
  'What is the average order total?',
  'Top 2 most expensive orders',
  'Get order 1003',
]

// Extended mode: 5 messy records (3 orders in different layouts + 2 bad ones).
const EXTENDED_EXAMPLES = [
  'Orders paid by card',
  'Orders in May 2026',
  'Average order total in Ohio',
  'Orders with no email',
]

const ICONS: Record<string, typeof SearchIcon> = {
  discover_server: SearchIcon,
  discover_tools: ListIcon,
  get_tool_schema: FileTextIcon,
  invoke_tool: PlugIcon,
}

function parse(content?: string) {
  try {
    return JSON.parse(content ?? '')
  } catch {
    return undefined
  }
}

// A plain-English title for each tool call, in the right tense.
function stepTitle(step: Step): string {
  const a = step.args
  const r = parse(step.result)
  if (step.error) return `Fixing a bad ${step.name} call`
  switch (step.name) {
    case 'discover_server':
      return step.done
        ? `Found API: ${(r ?? []).map((s: { server: string }) => s.server).join(', ')}`
        : 'Finding an API'
    case 'discover_tools':
      return step.done
        ? `Endpoints: ${(r ?? []).map((t: { tool: string }) => t.tool).join(', ')}`
        : `Listing endpoints on ${a.server}`
    case 'get_tool_schema':
      return step.done ? `Read the ${a.tool_name} schema` : `Reading the ${a.tool_name} schema`
    case 'invoke_tool':
      return step.done && r
        ? `Called ${a.tool_name}: ${r.fetched} fetched, ${r.parsed} parsed, ${r.rejected} rejected, ${r.matched} matched`
        : `Calling ${a.tool_name}`
    default:
      return step.name
  }
}

// What the LLM asked invoke_tool to do (filters, sorting, math), shown as code.
function invokeArgs(args: Record<string, unknown>): string | undefined {
  const shown = Object.fromEntries(
    Object.entries(args).filter(([k, v]) => k !== 'tool_name' && v != null),
  )
  return Object.keys(shown).length ? JSON.stringify(shown) : undefined
}

function applyEvent(turn: Turn, event: AgentEvent): Turn {
  const steps = [...turn.steps]
  const last = steps.findLastIndex((s) => !s.done)
  switch (event.type) {
    case 'tool_call':
      steps.push({ id: event.id, name: event.name, args: event.args, progress: [], done: false })
      break
    case 'progress':
      if (last >= 0) steps[last] = { ...steps[last], progress: [...steps[last].progress, event.message] }
      break
    case 'tool_result': {
      const i = steps.findIndex((s) => s.id === event.id)
      if (i >= 0) steps[i] = { ...steps[i], result: event.content, error: event.error, done: true }
      break
    }
    case 'done':
      return { ...turn, steps, result: event.output, failed: !!(event.output as { error?: string })?.error }
    case 'error':
      return { ...turn, steps, result: { error: event.message }, failed: true }
  }
  return { ...turn, steps }
}

function Steps({ turn }: { turn: Turn }) {
  const running = turn.result === undefined
  if (!running && turn.steps.length === 0) return null
  return (
    <Trace>
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine status={running ? 'running' : undefined}>
            <TraceIcon>
              <SparklesIcon />
            </TraceIcon>
            <TraceTitle>
              {running ? 'Working…' : `Worked in ${turn.steps.length} steps`}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted className="flex flex-col gap-2">
          {turn.steps.map((step) => {
            const Icon = step.error ? CircleAlertIcon : (ICONS[step.name] ?? PlugIcon)
            const args = step.name === 'invoke_tool' ? invokeArgs(step.args) : undefined
            return (
              <div key={step.id} className="flex flex-col gap-1">
                <TraceLine status={step.error ? 'error' : step.done ? undefined : 'running'}>
                  <TraceIcon>
                    <Icon />
                  </TraceIcon>
                  <TraceTitle>{stepTitle(step)}</TraceTitle>
                </TraceLine>
                {args && (
                  <TraceDescription className="pl-6">
                    <code className="font-mono text-xs break-all">{args}</code>
                  </TraceDescription>
                )}
                {step.progress.map((p, j) => (
                  <TraceDescription key={j} className="pl-6 text-xs">
                    {p}
                  </TraceDescription>
                ))}
              </div>
            )
          })}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

export function RaftChat() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [extended, setExtended] = useState(false)
  const pending = turns.length > 0 && turns.at(-1)?.result === undefined

  const update = (fn: (turn: Turn) => Turn) =>
    setTurns((t) => [...t.slice(0, -1), fn(t[t.length - 1])])

  async function ask(query: string) {
    query = query.trim()
    if (!query || pending) return
    setInput('')
    setTurns((t) => [...t, { query, extended, steps: [] }])
    try {
      const res = await fetch('/raft/api/ask/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, extended }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        update((turn) => ({ ...turn, result: body, failed: true }))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.trim()) update((turn) => applyEvent(turn, JSON.parse(line)))
        }
        if (done) break
      }
      update((turn) =>
        turn.result === undefined
          ? { ...turn, result: { error: 'the agent stopped without an answer' }, failed: true }
          : turn,
      )
    } catch {
      update((turn) => ({ ...turn, result: { error: 'could not reach the agent' }, failed: true }))
    }
  }

  return (
    <div className="flex h-[36rem] flex-col gap-4">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="rounded-2xl border border-zinc-100 dark:border-zinc-700/40">
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-4">
              {turns.length === 0 && (
                <div className="m-auto flex flex-col items-center gap-3 text-sm text-zinc-500">
                  <p>Try one of these:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(extended ? EXTENDED_EXAMPLES : EXAMPLES).map((q) => (
                      <button
                        key={q}
                        onClick={() => ask(q)}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((turn, i) => [
                // The question is the scroll anchor; the reply streams in under it.
                <MessageScrollerItem key={`q${i}`} messageId={`q${i}`} scrollAnchor>
                  <Message align="end">
                    <MessageContent>
                      <Bubble>
                        <BubbleContent>
                          {turn.query}
                          {turn.extended && (
                            <span className="ml-2 text-xs opacity-60">· extended data</span>
                          )}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>,
                <MessageScrollerItem key={`a${i}`} messageId={`a${i}`}>
                  <Message>
                    <MessageContent className="flex flex-col gap-3">
                      <Steps turn={turn} />
                      {turn.result !== undefined && (
                        <Bubble variant={turn.failed ? 'destructive' : 'muted'}>
                          <BubbleContent>
                            <pre className="overflow-x-auto font-mono text-xs">
                              {JSON.stringify(turn.result, null, 2)}
                            </pre>
                          </BubbleContent>
                        </Bubble>
                      )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>,
              ])}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <Switch
          id="raft-extended"
          checked={extended}
          onCheckedChange={setExtended}
          disabled={pending}
        />
        <Label htmlFor="raft-extended" className="font-normal">
          Extended data: 5 records in messy formats, with extra fields (date, email, payment)
        </Label>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            value={input}
            maxLength={500}
            placeholder="Ask about orders…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(input)
              }
            }}
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              className="ml-auto rounded-full"
              disabled={pending || !input.trim()}
            >
              <ArrowUpIcon />
              <span className="sr-only">Send</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  )
}
