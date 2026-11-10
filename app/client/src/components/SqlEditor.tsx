import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { MySQL, sql } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view";

interface SqlEditorProps {
  questionId: string;
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onSubmit: () => void;
}

export function SqlEditor({
  questionId,
  value,
  onChange,
  onRun,
  onSubmit
}: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const handlersRef = useRef({ onChange, onRun, onSubmit });
  handlersRef.current = { onChange, onRun, onSubmit };

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        sql({ dialect: MySQL }),
        keymap.of([
          {
            key: "Mod-Shift-Enter",
            run: () => {
              handlersRef.current.onSubmit();
              return true;
            }
          },
          {
            key: "Mod-Enter",
            run: () => {
              handlersRef.current.onRun();
              return true;
            }
          },
          ...defaultKeymap,
          ...historyKeymap
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            handlersRef.current.onChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "13px",
            backgroundColor: "#fbfcfd"
          },
          ".cm-content": {
            padding: "18px 0",
            caretColor: "#16855b",
            fontFamily:
              "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
            lineHeight: "1.65"
          },
          ".cm-gutters": {
            backgroundColor: "#f6f8f9",
            color: "#9aa4aa",
            borderRight: "1px solid #e3e7e9"
          },
          ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "#eef7f2"
          },
          "&.cm-focused": { outline: "none" }
        })
      ]
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [questionId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
  }, [value]);

  return <div className="sql-editor" ref={hostRef} aria-label="SQL 编辑器" />;
}
