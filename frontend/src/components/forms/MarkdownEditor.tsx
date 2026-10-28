import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Bold, Code, Heading3, Italic, List, ListOrdered, SquareCode } from 'lucide-react';
import { cn } from '../../lib/cn';

const getMarkdown = (editor: Editor) => (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  placeholder?: string;
}

/**
 * Tiptap rich-text editor that stores Markdown (spec 2: "Tiptap — editing
 * generated lessons"). Raw HTML is disabled, so edits can never inject markup.
 */
export function MarkdownEditor({ value, onChange, label, placeholder }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [3, 4] } }), Markdown.configure({ html: false, transformPastedText: true, linkify: false })],
    content: value,
    editorProps: { attributes: { class: 'prose-cl tiptap px-3 py-2', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => onChange(getMarkdown(e)),
  });

  // Keep external resets (e.g. restoring a version) in sync without fighting the cursor.
  useEffect(() => {
    if (!editor) return;
    const current = getMarkdown(editor);
    if (current !== value && !editor.isFocused) editor.commands.setContent(value);
  }, [value, editor]);

  const btn = (active: boolean) => cn('p-1.5 rounded hover:bg-surface-2', active ? 'text-primary bg-surface-2' : 'text-muted');

  return (
    <div>
      <p className="text-sm font-medium mb-1.5">{label}</p>
      <div className="rounded-[10px] border border-border bg-surface shadow-card focus-within:border-primary">
        {editor && (
          <div className="flex gap-0.5 border-b border-border px-1.5 py-1" role="toolbar" aria-label={`${label} formatting`}>
            <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">
              <Bold className="h-4 w-4" />
            </button>
            <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">
              <Italic className="h-4 w-4" />
            </button>
            <button type="button" className={btn(editor.isActive('code'))} onClick={() => editor.chain().focus().toggleCode().run()} aria-label="Inline code">
              <Code className="h-4 w-4" />
            </button>
            <button type="button" className={btn(editor.isActive('heading'))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="Heading">
              <Heading3 className="h-4 w-4" />
            </button>
            <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list">
              <List className="h-4 w-4" />
            </button>
            <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list">
              <ListOrdered className="h-4 w-4" />
            </button>
            <button type="button" className={btn(editor.isActive('codeBlock'))} onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-label="Code block">
              <SquareCode className="h-4 w-4" />
            </button>
          </div>
        )}
        <EditorContent editor={editor} placeholder={placeholder} />
      </div>
    </div>
  );
}
