declare module 'react-native-render-html' {
  import { ComponentType } from 'react';

  interface RenderHTMLSource {
    html?: string;
    uri?: string;
  }

  interface RenderHTMLProps {
    source: RenderHTMLSource;
    contentWidth: number;
    tagsStyles?: Record<string, any>;
  }

  const RenderHTML: ComponentType<RenderHTMLProps>;

  export default RenderHTML;
}

