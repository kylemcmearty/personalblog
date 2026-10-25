'use client'

import { useState } from 'react'
import { ArrowUpIcon } from 'lucide-react'

import { Bubble, BubbleContent } from '@/components/ui/bubble'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Message, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'

type Turn = { query: string; result?: unknown; failed?: boolean }

const EXAMPLES = [
  'Show me all orders from Ohio over $500',
  'What is the average order total?',
  'Get order 1003',
]

export function RaftChat() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const pending = turns.at(-1)?.result === undefined && turns.length > 0

  async function ask(query: string) {
    query = query.trim()
    if (!query || pending) return
    setInput('')
    setTurns((t) => [...t, { query }])
    let turn: Turn
    try {
      const res = await fetch('/raft/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const result = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      turn = { query, result, failed: !res.ok }
    } catch {
      turn = { query, result: { error: 'could not reach the agent' }, failed: true }
    }
    setTurns((t) => [...t.slice(0, -1), turn])
  }

  return (
    <div className="flex h-[36rem] flex-col gap-4">
      <MessageScrollerProvider>
      <MessageScroller className="rounded-2xl border border-zinc-100 dark:border-zinc-700/40">
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-4">
            {turns.length === 0 && (
              <div className="m-auto flex flex-col items-center gap-3 text-sm text-zinc-500">
                <p>Try one of these:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((q) => (
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
            {turns.map((turn, i) => (
              <MessageScrollerItem key={i} scrollAnchor className="flex flex-col gap-4">
                <Message align="end">
                  <MessageContent>
                    <Bubble>
                      <BubbleContent>{turn.query}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
                <Message>
                  <MessageContent>
                    <Bubble variant={turn.failed ? 'destructive' : 'muted'}>
                      <BubbleContent>
                        {turn.result === undefined ? (
                          <span className="animate-pulse text-zinc-500">Thinking…</span>
                        ) : (
                          <pre className="overflow-x-auto font-mono text-xs">
                            {JSON.stringify(turn.result, null, 2)}
                          </pre>
                        )}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
      </MessageScrollerProvider>

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
