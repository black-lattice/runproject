import PageHeading from "@/components/PageHeading";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as prettier from "prettier/standalone";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import cssLanguage from "react-syntax-highlighter/dist/esm/languages/prism/css";
import javascriptLanguage from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsonLanguage from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdownLanguage from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markupLanguage from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import sqlLanguage from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import typescriptLanguage from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";

SyntaxHighlighter.registerLanguage("css", cssLanguage);
SyntaxHighlighter.registerLanguage("javascript", javascriptLanguage);
SyntaxHighlighter.registerLanguage("json", jsonLanguage);
SyntaxHighlighter.registerLanguage("markdown", markdownLanguage);
SyntaxHighlighter.registerLanguage("html", markupLanguage);
SyntaxHighlighter.registerLanguage("xml", markupLanguage);
SyntaxHighlighter.registerLanguage("sql", sqlLanguage);
SyntaxHighlighter.registerLanguage("typescript", typescriptLanguage);

const loadPrettierPlugins = async (...loaders) =>
  Promise.all(loaders.map(async (loader) => (await loader()).default));

const FORMATTERS = {
  json: {
    name: "JSON",
    extensions: [".json"],
    format: async (text) => {
      const plugins = await loadPrettierPlugins(
        () => import("prettier/plugins/babel"),
        () => import("prettier/plugins/estree"),
      );
      return await prettier.format(text, {
        parser: "json",
        plugins,
        tabWidth: 2,
        semi: true,
        singleQuote: false,
      });
    },
  },
  javascript: {
    name: "JavaScript",
    extensions: [".js", ".jsx"],
    format: async (text) => {
      const plugins = await loadPrettierPlugins(
        () => import("prettier/plugins/babel"),
        () => import("prettier/plugins/estree"),
      );
      return await prettier.format(text, {
        parser: "babel",
        plugins,
        tabWidth: 2,
        semi: true,
        singleQuote: true,
      });
    },
  },
  typescript: {
    name: "TypeScript",
    extensions: [".ts", ".tsx"],
    format: async (text) => {
      const plugins = await loadPrettierPlugins(
        () => import("prettier/plugins/babel"),
        () => import("prettier/plugins/estree"),
      );
      return await prettier.format(text, {
        parser: "babel-ts",
        plugins,
        tabWidth: 2,
        semi: true,
        singleQuote: true,
      });
    },
  },
  css: {
    name: "CSS",
    extensions: [".css", ".scss", ".less"],
    format: async (text) => {
      const plugins = await loadPrettierPlugins(
        () => import("prettier/plugins/postcss"),
      );
      return await prettier.format(text, {
        parser: "css",
        plugins,
        tabWidth: 2,
      });
    },
  },
  html: {
    name: "HTML",
    extensions: [".html", ".htm"],
    format: async (text) => {
      const plugins = await loadPrettierPlugins(
        () => import("prettier/plugins/html"),
      );
      return await prettier.format(text, {
        parser: "html",
        plugins,
        tabWidth: 2,
        htmlWhitespaceSensitivity: "css",
      });
    },
  },
  xml: {
    name: "XML",
    extensions: [".xml", ".svg"],
    format: async (text) => {
      const plugins = await loadPrettierPlugins(
        () => import("prettier/plugins/html"),
      );
      return await prettier.format(text, {
        parser: "html",
        plugins,
        tabWidth: 2,
      });
    },
  },
  sql: {
    name: "SQL",
    extensions: [".sql"],
    format: (text) => {
      return text
        .replace(/\bLEFT JOIN\b/gi, "\n__LEFT_JOIN__\n  ")
        .replace(/\bINNER JOIN\b/gi, "\n__INNER_JOIN__\n  ")
        .replace(/\bJOIN\b/gi, "\nJOIN\n  ")
        .replace(/\bSELECT\b/gi, "\nSELECT\n  ")
        .replace(/\bFROM\b/gi, "\nFROM\n  ")
        .replace(/\bWHERE\b/gi, "\nWHERE\n  ")
        .replace(/\bAND\b/gi, "\n  AND ")
        .replace(/\bOR\b/gi, "\n  OR ")
        .replace(/\bORDER BY\b/gi, "\nORDER BY\n  ")
        .replace(/\bGROUP BY\b/gi, "\nGROUP BY\n  ")
        .replace(/__LEFT_JOIN__/g, "LEFT JOIN")
        .replace(/__INNER_JOIN__/g, "INNER JOIN")
        .trim();
    },
  },
  markdown: {
    name: "Markdown",
    extensions: [".md", ".markdown"],
    format: async (text) => {
      const plugins = await loadPrettierPlugins(
        () => import("prettier/plugins/markdown"),
      );
      return await prettier.format(text, {
        parser: "markdown",
        plugins,
        proseWrap: "preserve",
      });
    },
  },
};

function FormatterPage() {
  const [isDarkMode, setIsDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("json");
  const [error, setError] = useState("");
  const [leftWidth, setLeftWidth] = useState(50);
  const workspaceRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = (event) => setIsDarkMode(event.matches);
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);
  const { toast } = useToast();

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const minWidth = Math.min((240 / bounds.width) * 100, 45);
    const newWidth = ((e.clientX - bounds.left) / bounds.width) * 100;
    setLeftWidth(Math.max(minWidth, Math.min(100 - minWidth, newWidth)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleFormat = async () => {
    setError("");

    if (!inputText.trim()) {
      setError("请输入要格式化的内容");
      return;
    }

    try {
      const formatter = FORMATTERS[selectedFormat];

      const formatted = await formatter.format(inputText);
      setOutputText(formatted);

      toast({
        description: (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>格式化成功</span>
          </div>
        ),
      });
    } catch (err) {
      setError(`格式化失败: ${err.message}`);
      setOutputText("");
      toast({
        variant: "destructive",
        description: (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>格式化失败</span>
          </div>
        ),
      });
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;

    try {
      await navigator.clipboard.writeText(outputText);
      toast({
        description: (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>已复制到剪贴板</span>
          </div>
        ),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        description: "复制失败",
      });
    }
  };

  const handleClear = () => {
    setInputText("");
    setOutputText("");
    setError("");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setInputText(content);

        const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
        for (const [key, formatter] of Object.entries(FORMATTERS)) {
          if (formatter.extensions?.includes(ext)) {
            setSelectedFormat(key);
            break;
          }
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = () => {
    if (!outputText) return;

    const formatter = FORMATTERS[selectedFormat];
    const ext = formatter.extensions?.[0] || ".txt";
    const blob = new Blob([outputText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `formatted${ext}`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      description: (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span>文件已下载</span>
        </div>
      ),
    });
  };

  return (
    <div
      className="formatter-page h-full flex flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <PageHeading
        title="数据格式化"
        description="整理代码与数据，让输入和输出一目了然"
      >
        <Button onClick={handleFormat}>
          <Play className="h-4 w-4" />
          格式化
        </Button>
      </PageHeading>
      {error && (
        <div className="m-4 p-3 bg-destructive/10 border border-destructive/25 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">格式化错误</p>
            <p className="text-sm text-destructive mt-1">{error}</p>
          </div>
        </div>
      )}

      <div
        ref={workspaceRef}
        className="formatter-workspace flex-1 flex overflow-hidden border-t relative"
        style={{ "--formatter-split": `${leftWidth}%` }}
      >
        <Card
          className="formatter-panel flex flex-col overflow-hidden rounded-none border-y-0 border-l-0 shadow-none"
          style={{ "--panel-width": `${leftWidth}%` }}
        >
          <div className="formatter-toolbar flex items-center justify-between px-4 py-2 border-b">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">输入</span>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger
                  aria-label="数据格式"
                  className="h-8 w-[112px] bg-card"
                >
                  <SelectValue placeholder="选择格式" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMATTERS).map(([key, formatter]) => (
                    <SelectItem key={key} value={key}>
                      {formatter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              <label>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".json,.js,.jsx,.ts,.tsx,.css,.html,.xml,.sql,.md,.markdown"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground hover:text-primary px-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.currentTarget.parentElement
                      ?.querySelector("input")
                      ?.click();
                  }}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  导入
                </Button>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 text-muted-foreground hover:text-destructive px-2"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                清空
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`粘贴你的 ${FORMATTERS[selectedFormat].name} 数据...`}
              aria-label="输入数据"
              className="formatter-editor w-full h-full p-4 font-mono text-sm leading-6 resize-none"
              spellCheck={false}
            />
          </div>
        </Card>

        <div
          className={`formatter-divider absolute z-10 w-1 h-full cursor-col-resize transition-colors ${isDragging ? "formatter-divider-active" : "bg-transparent"}`}
          style={{
            left: `${leftWidth}%`,
            transform: "translateX(-50%)",
          }}
          onMouseDown={handleMouseDown}
        />

        <Card
          className="formatter-panel flex flex-col overflow-hidden rounded-none border-y-0 border-r-0 shadow-none border-l"
          style={{ "--panel-width": `${100 - leftWidth}%` }}
        >
          <div className="formatter-toolbar flex items-center justify-between px-4 py-2 border-b">
            <span className="text-sm font-semibold text-foreground">输出</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                disabled={!outputText}
                className="h-8 text-muted-foreground hover:text-success px-2"
              >
                <Download className="h-4 w-4 mr-1" />
                下载
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!outputText}
                className="h-8 text-muted-foreground hover:text-primary px-2"
              >
                <Copy className="h-4 w-4 mr-1" />
                复制
              </Button>
            </div>
          </div>
          <div
            className="formatter-output flex-1 overflow-auto bg-card"
            role="region"
            aria-label="格式化输出"
          >
            {outputText ? (
              <SyntaxHighlighter
                language={selectedFormat}
                style={isDarkMode ? oneDark : oneLight}
                codeTagProps={{
                  style: {
                    background: "transparent",
                    fontFamily: "var(--font-mono)",
                  },
                }}
                customStyle={{
                  margin: 0,
                  padding: "1rem",
                  fontSize: "0.875rem",
                  lineHeight: "1.5rem",
                  backgroundColor: "transparent",
                }}
                showLineNumbers={true}
                lineNumberStyle={{
                  minWidth: "3em",
                  paddingRight: "1em",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                {outputText}
              </SyntaxHighlighter>
            ) : (
              <div className="p-4 text-muted-foreground text-sm">
                格式化结果将显示在这里...
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default FormatterPage;
