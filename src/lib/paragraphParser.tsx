// Parser to extract Payload rich text blocks into HTML chunks

interface LexicalTextNode {
  type: 'text';
  text: string;
  format?: number;
}

interface LexicalLinkNode {
  type: 'link';
  fields?: {
    url?: string;
    newTab?: boolean;
  };
  children?: LexicalNode[];
}

interface LexicalHeadingNode {
  type: 'heading';
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  children?: LexicalNode[];
}

interface LexicalParagraphNode {
  type: 'paragraph';
  children?: LexicalNode[];
}

interface LexicalListNode {
  type: 'list';
  tag: 'ul' | 'ol';
  children?: LexicalNode[];
}

interface LexicalListItemNode {
  type: 'listitem';
  children?: LexicalNode[];
}

interface LexicalBlockNode {
  type: 'block';
  fields?: {
    id?: string;
    media?: number;
    blockType?: string;
  };
}

interface LexicalHorizontalRuleNode {
  type: 'horizontalrule';
}

type LexicalNode =
  | LexicalTextNode
  | LexicalLinkNode
  | LexicalHeadingNode
  | LexicalParagraphNode
  | LexicalListNode
  | LexicalListItemNode
  | LexicalBlockNode
  | LexicalHorizontalRuleNode;

interface LexicalRoot {
  root: {
    children: LexicalNode[];
  };
}

export interface ParagraphBlock {
  id: string;
  html: string;
}

const escapeHTML = (str: string = ''): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const applyFormatting = (text: string, format: number = 0): string => {
  let formatted = text;

  // Lexical uses bitmasks for inline formatting
  const FORMAT_BOLD = 1;
  const FORMAT_ITALIC = 2;
  const FORMAT_UNDERLINE = 4;
  const FORMAT_STRIKETHROUGH = 8;
  const FORMAT_CODE = 16;

  if (format & FORMAT_CODE) {
    formatted = `<code>${formatted}</code>`;
  }
  if (format & FORMAT_BOLD) {
    formatted = `<strong>${formatted}</strong>`;
  }
  if (format & FORMAT_ITALIC) {
    formatted = `<em>${formatted}</em>`;
  }
  if (format & FORMAT_UNDERLINE) {
    formatted = `<u>${formatted}</u>`;
  }
  if (format & FORMAT_STRIKETHROUGH) {
    formatted = `<s>${formatted}</s>`;
  }

  return formatted;
};

const renderNodesToHTML = (nodes: LexicalNode[] = []): string =>
  nodes.map((node) => renderNodeToHTML(node)).join('');

const renderNodeToHTML = (node: LexicalNode): string => {
  if (!node) return '';

  switch (node.type) {
    case 'text': {
      const textNode = node as LexicalTextNode;
      return applyFormatting(escapeHTML(textNode.text || ''), textNode.format);
    }
    case 'paragraph': {
      const paragraphNode = node as LexicalParagraphNode;
      const inner = renderNodesToHTML(paragraphNode.children);
      return inner.trim() ? `<p>${inner}</p>` : '';
    }
    case 'heading': {
      const headingNode = node as LexicalHeadingNode;
      const inner = renderNodesToHTML(headingNode.children);
      return `<${headingNode.tag}>${inner}</${headingNode.tag}>`;
    }
    case 'link': {
      const linkNode = node as LexicalLinkNode;
      const href = escapeHTML(linkNode.fields?.url || '#');
      const target = linkNode.fields?.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
      const inner = renderNodesToHTML(linkNode.children);
      return `<a href="${href}"${target}>${inner}</a>`;
    }
    case 'list': {
      const listNode = node as LexicalListNode;
      const tag = listNode.tag || 'ul';
      const inner = renderNodesToHTML(listNode.children);
      return `<${tag}>${inner}</${tag}>`;
    }
    case 'listitem': {
      const listItemNode = node as LexicalListItemNode;
      const inner = renderNodesToHTML(listItemNode.children);
      return `<li>${inner}</li>`;
    }
    case 'horizontalrule': {
      return '<hr />';
    }
    case 'block': {
      const blockNode = node as LexicalBlockNode;
      const blockType = escapeHTML(blockNode.fields?.blockType || 'custom-block');
      const blockId = escapeHTML(blockNode.fields?.id || '');
      return `<div data-block-type="${blockType}" data-block-id="${blockId}" class="payload-block-placeholder">[${blockType}]</div>`;
    }
    default:
      return '';
  }
};

// Parse lexical content into blocks of HTML similar to Payload preview
export const parseToParagraphBlocks = (content: LexicalRoot): ParagraphBlock[] => {
  if (!content?.root?.children) {
    return [];
  }

  const blocks: ParagraphBlock[] = [];
  let currentHeadingHtml = '';
  let currentBodyHtml = '';
  let bufferIndex = 0;

  const flushGroup = () => {
    const combined = `${currentHeadingHtml || ''}${currentBodyHtml || ''}`;
    if (combined.trim()) {
      blocks.push({
        id: `block-${bufferIndex++}`,
        html: combined,
      });
    }
    currentHeadingHtml = '';
    currentBodyHtml = '';
  };

  content.root.children.forEach((node) => {
    const html = renderNodeToHTML(node);
    if (!html || !html.trim()) {
      return;
    }

    const isHeading = node.type === 'heading';
    const isDivider = node.type === 'horizontalrule';
    const isCustomBlock = node.type === 'block';

    if (isHeading) {
      // Finish previous group and start a new heading section
      flushGroup();
      currentHeadingHtml = html;
      return;
    }

    if (isDivider || isCustomBlock) {
      currentBodyHtml += html;
      return;
    }

    // Paragraph/list/etc: append to body
    currentBodyHtml += html;
  });

  flushGroup();

  return blocks;
};

