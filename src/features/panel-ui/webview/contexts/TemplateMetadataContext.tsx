import { createContext } from "preact";
import { useState, useEffect } from "preact/hooks";
import { AITemplateFile } from "../../../ai-template-files/models/aiTemplateFile";
import { TemplateMetadata } from "../../../ai-template-files/models/templateMetadata";
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";

interface MetadataState {
  metadata: TemplateMetadata | null;
  loading: boolean;
  error: string | null;
}

interface TemplateMetadataCache {
  [key: string]: MetadataState;
}

interface TemplateMetadataContextValue {
  cache: TemplateMetadataCache;
  setCache: (updater: (prev: TemplateMetadataCache) => TemplateMetadataCache) => void;
}

export const TemplateMetadataContext = createContext<TemplateMetadataContextValue | null>(null);

export function TemplateMetadataProvider({ children }: { children: any }) {
  const messenger = useVSCodeAPI();
  const [cache, setCache] = useState<TemplateMetadataCache>({});

  // Listen for metadata responses
  useEffect(() => {
    const unsubscribe = messenger.onMessage("templateMetadataResponse", (message) => {
      if (message.command !== "templateMetadataResponse") return;
      const key = getTemplateKey(message.template);
      setCache((prev) => ({
        ...prev,
        [key]: {
          metadata: message.metadata,
          loading: false,
          error: message.error || null,
        },
      }));
    });

    return unsubscribe;
  }, [messenger]);

  return (
    <TemplateMetadataContext.Provider value={{ cache, setCache }}>
      {children}
    </TemplateMetadataContext.Provider>
  );
}

export function getTemplateKey(template: AITemplateFile): string {
  return `${template.repository}::${template.type}::${template.name}`;
}
