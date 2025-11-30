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

interface MediaObject {
  id: number;
  url: string;
  width?: number;
  height?: number;
  alt?: string | null;
  filename?: string;
}

interface LexicalBlockNode {
  type: 'block';
  fields?: {
    id?: string;
    media?: MediaObject | number;
    blockType?: string;
    blockName?: string;
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

// Format media URL - add https:// if missing
const formatMediaUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
};

const Format = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,
  CODE: 16,
} as const;

const applyFormatting = (text: string, format: number = 0): string => {
  let formatted = text;

  if (format & Format.CODE) {
    formatted = `<code>${formatted}</code>`;
  }
  if (format & Format.BOLD) {
    formatted = `<strong>${formatted}</strong>`;
  }
  if (format & Format.ITALIC) {
    formatted = `<em>${formatted}</em>`;
  }
  if (format & Format.UNDERLINE) {
    formatted = `<u>${formatted}</u>`;
  }
  if (format & Format.STRIKETHROUGH) {
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
      const format = textNode.format ?? 0;
      // if (format !== 0) {
      //   console.log('[PARAGRAPH_PARSER] Text node with format:', {
      //     text: textNode.text,
      //     format: format,
      //     formatBinary: format.toString(2),
      //     isBold: !!(format & Format.BOLD),
      //     isItalic: !!(format & Format.ITALIC),
      //   });
      // }
      return applyFormatting(escapeHTML(textNode.text || ''), format);
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
      
      // Handle media blocks
      if (blockType === 'mediaBlock' && blockNode.fields?.media) {
        const media = blockNode.fields.media;
        // Check if media is an object (new format) or a number (old format)
        // Use type guard to properly narrow the type
        if (typeof media === 'object' && media !== null && 'url' in media) {
          const mediaObj = media as MediaObject;
          const mediaUrl = formatMediaUrl(mediaObj.url);
          const alt = escapeHTML(mediaObj.alt || mediaObj.filename || '');
          const width = mediaObj.width ? ` width="${mediaObj.width}"` : '';
          const height = mediaObj.height ? ` height="${mediaObj.height}"` : '';
          return `<img src="${escapeHTML(mediaUrl)}" alt="${alt}"${width}${height} style="max-width: 100%; height: auto; display: block; margin: 16px 0;" />`;
        }
      }
      
      // Fallback for other block types
      return `<div data-block-type="${blockType}" data-block-id="${blockId}" class="payload-block-placeholder">[${blockType}]</div>`;
    }
    default:
      return '';
  }
};

// Parse lexical content into blocks of HTML similar to Payload preview
export const parseToParagraphBlocks = (content: LexicalRoot): ParagraphBlock[] => {
  // Log the full content JSON for debugging
  //console.log('[PARAGRAPH_PARSER] Full article content JSON:', JSON.stringify(content, null, 2));
  
  if (!content?.root?.children) {
    return [];
  }

  const blocks: ParagraphBlock[] = [];
  let currentPageHtml = '';
  let bufferIndex = 0;

  const flushPage = () => {
    if (currentPageHtml.trim()) {
      blocks.push({
        id: `block-${bufferIndex++}`,
        html: currentPageHtml,
      });
    }
    currentPageHtml = '';
  };

  content.root.children.forEach((node) => {
    // Check if it's a horizontal rule FIRST, before rendering
    const isDivider = node.type === 'horizontalrule';

    if (isDivider) {
      // Finish current page (all content before this horizontal rule)
      flushPage();
      // Don't include the horizontal rule itself in the HTML
      return;
    }

    // Render all other content (headings, paragraphs, lists, blocks, etc.)
    const html = renderNodeToHTML(node);
    
    // Add to current page even if empty (to preserve structure)
    // Empty paragraphs will be filtered by renderNodeToHTML anyway
    if (html) {
      currentPageHtml += html;
    }
  });

  // Flush any remaining content after the last horizontal rule as the final page
  flushPage();

  return blocks;
};

