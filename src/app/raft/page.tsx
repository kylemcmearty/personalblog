import { type Metadata } from 'next'

import { SimpleLayout } from '@/components/SimpleLayout'
import { RaftChat } from './RaftChat'

export const metadata: Metadata = {
  title: 'Raft Order Agent',
  description:
    'Ask questions about customer orders in plain English. An LLM agent parses messy order text and code builds the JSON answer.',
}

export default function Raft() {
  return (
    <SimpleLayout
      title="Raft order agent"
      intro="Ask about customer orders in plain English. The agent discovers the API from its spec, an LLM parses the messy order text, and code filters the records and builds the JSON answer."
    >
      <RaftChat />
    </SimpleLayout>
  )
}
