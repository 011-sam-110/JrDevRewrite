'use client';

import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';
import type { BattleLanguage } from '@/domain/battles';

/**
 * The battle code editor: CodeMirror 6 in the arena-terminal skin, one
 * language extension per kernel `BattleLanguage`. Paste and drop are BLOCKED
 * at the editor (the in-match anti-cheat stance: battles ban AI assistance and
 * pasted solutions; you type your answer here). Every blocked attempt calls
 * `onPasteBlocked` so the arena can record + send the telemetry signal.
 */

const LANGUAGE_EXTENSIONS: Record<BattleLanguage, () => Extension> = {
  python: () => python(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  java: () => java(),
  cpp: () => cpp(),
};

export const LANGUAGE_LABELS: Record<BattleLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
};

/** Arena-terminal chrome — every colour comes from the design tokens. */
const arenaTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-ink)',
      color: 'var(--color-fg)',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      caretColor: 'var(--color-volt)',
      paddingTop: '8px',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-volt)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-gutters': {
      backgroundColor: 'var(--color-ink)',
      color: 'var(--color-fg-subtle)',
      border: 'none',
      borderRight: '1px solid var(--color-edge-subtle)',
      fontFamily: 'var(--font-mono)',
    },
    '.cm-activeLine': { backgroundColor: 'rgb(22 31 51 / 0.55)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--color-fg-muted)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgb(191 255 63 / 0.16) !important',
    },
  },
  { dark: true },
);

const arenaHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--color-volt)' },
  { tag: [tags.string, tags.special(tags.string)], color: '#ffd28a' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-elo)' },
  { tag: tags.comment, color: 'var(--color-fg-subtle)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#53d1ff' },
  { tag: [tags.typeName, tags.className], color: '#7ee0c0' },
  { tag: tags.operator, color: 'var(--color-fg-muted)' },
]);

export function CodeEditor({
  value,
  language,
  onChange,
  onPasteBlocked,
  readOnly = false,
}: {
  value: string;
  language: BattleLanguage;
  onChange: (code: string) => void;
  onPasteBlocked: () => void;
  readOnly?: boolean;
}) {
  const extensions = useMemo(
    () => [
      LANGUAGE_EXTENSIONS[language](),
      arenaTheme,
      syntaxHighlighting(arenaHighlight),
      // The paste/drop block. Returning true tells CodeMirror the event is
      // handled; preventDefault stops the browser inserting the text.
      EditorView.domEventHandlers({
        paste: (event) => {
          event.preventDefault();
          onPasteBlocked();
          return true;
        },
        drop: (event) => {
          event.preventDefault();
          onPasteBlocked();
          return true;
        },
      }),
    ],
    [language, onPasteBlocked],
  );

  return (
    <div className="h-full overflow-hidden" data-testid="code-editor">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        readOnly={readOnly}
        height="100%"
        theme="none"
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
        aria-label="Solution editor"
      />
    </div>
  );
}
