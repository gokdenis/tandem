import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { store } from '../../core/store'
import { tools } from '../index'

/**
 * The evaluation set in evals/tool-surface.xml claims that each question has a
 * particular answer. These tests derive the same answers from the tools, so a
 * change to a tool or to the seeded workspace that would invalidate a question
 * fails here rather than being discovered by whoever runs the evaluation.
 */

const call = (name: string, args: Record<string, unknown> = {}) => {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool named ${name}`)
  return tool.execute(args)
}
const structured = async <T,>(name: string, args?: Record<string, unknown>) =>
  (await call(name, args)).structuredContent as T

type Topic = { topic: string; cards: number; lapses: number; difficulty: number }
type Deck = { name: string; cards: number; due: number; daysToExam: number | null; topics: string[]; examDate: string | null }
type Annotated = { topic: string; verdict: string; afterMisses: string }

const expected = Object.fromEntries(
  [...readFileSync('evals/tool-surface.xml', 'utf8').matchAll(/<answer>([\s\S]*?)<\/answer>/g)].map((m, i) => [
    i + 1,
    m[1]!.trim(),
  ]),
)

beforeEach(() => store.reset('human'))

describe('the evaluation set answers its own questions', () => {
  it('1: the topic with the most lapses', async () => {
    const decks = await structured<{ decks: Deck[] }>('list_decks')
    const all: Topic[] = []
    for (const d of decks.decks) all.push(...(await structured<{ topics: Topic[] }>('get_weak_topics', { deck: d.name })).topics)
    const worst = all.sort((a, b) => b.lapses - a.lapses)[0]!
    expect(`${worst.topic}: ${worst.lapses}`).toBe(expected[1])
  })

  it('2 and 3: which explanation failed, and how the one that worked did', async () => {
    const { annotated } = await structured<{ annotated: Annotated[] }>('get_note_impact')
    const failing = annotated.filter((a) => a.verdict === 'not landing')
    expect(failing).toHaveLength(1)
    expect(failing[0]!.topic).toBe(expected[2])
    const helping = annotated.filter((a) => a.verdict === 'helping')
    expect(helping).toHaveLength(1)
    expect(helping[0]!.afterMisses).toBe(expected[3])
  })

  it('4: the deck with an exam date', async () => {
    const { decks } = await structured<{ decks: Deck[] }>('list_decks')
    const dated = decks.filter((d) => d.examDate !== null)
    expect(dated).toHaveLength(1)
    expect(`${dated[0]!.daysToExam} days, ${dated[0]!.cards} cards`).toBe(expected[4])
  })

  it('5: cards mentioning deadlock', async () => {
    const r = await structured<{ total: number }>('search_cards', { query: 'deadlock' })
    expect(String(r.total)).toBe(expected[5])
  })

  it('6: the topic of the TLB card', async () => {
    const r = await structured<{ matches: Array<{ topic: string }> }>('search_cards', { query: 'TLB miss' })
    expect(r.matches[0]!.topic).toBe(expected[6])
  })

  it('7: topics in the deck with no exam date', async () => {
    const { decks } = await structured<{ decks: Deck[] }>('list_decks')
    const undated = decks.find((d) => d.examDate === null)!
    expect(String(undated.topics.length)).toBe(expected[7])
  })

  it('8: cards in the second weakest topic of the exam deck', async () => {
    const { decks } = await structured<{ decks: Deck[] }>('list_decks')
    const dated = decks.find((d) => d.examDate !== null)!
    const { topics } = await structured<{ topics: Topic[] }>('get_weak_topics', { deck: dated.name })
    expect(String(topics[1]!.cards)).toBe(expected[8])
  })

  it('9: the two untouched topics that tie', async () => {
    const { decks } = await structured<{ decks: Deck[] }>('list_decks')
    const dated = decks.find((d) => d.examDate !== null)!
    const { topics } = await structured<{ topics: Topic[] }>('get_weak_topics', { deck: dated.name })
    const zero = topics.filter((t) => t.lapses === 0 && t.difficulty > 0)
    const tied = zero.filter((t) => t.difficulty === zero[0]!.difficulty).map((t) => t.topic).sort()
    expect(tied.join(', ')).toBe(expected[9])
  })

  it('10: cards due across every deck', async () => {
    const { decks } = await structured<{ decks: Deck[] }>('list_decks')
    const due = decks.reduce((sum, d) => sum + d.due, 0)
    expect(String(due)).toBe(expected[10])
  })
})
