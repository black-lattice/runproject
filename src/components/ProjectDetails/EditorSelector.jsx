import { invoke } from '@tauri-apps/api/core';
import { Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import traeIcon from '@/assets/icons/www.trae.ai.ico';
import cursorIcon from '@/assets/icons/cursor.com.ico';
const EDITOR_ICONS = {
  trae: traeIcon,
  cursor: cursorIcon
};

function EditorSelector({
	project,
	selectedEditor,
	availableEditors,
	isLoadingEditors,
	onEditorChange,
	onRefreshEditors
}) {
	const { toast } = useToast();

	const handleOpenInEditor = async editorId => {
		const editor = availableEditors.find(e => e.id === editorId);
		if (!editor) return;

		try {
			await invoke('open_project_in_editor', {
				editorId: editorId,
				projectPath: project.path
			});

			onEditorChange(editorId);

			toast({
				title: '打开成功',
				description: `已在 ${editor.name} 中打开项目`
			});
		} catch (error) {
			console.error('打开项目失败:', error);
			toast({
				title: '打开失败',
				description: error.toString(),
				variant: 'destructive'
			});
		}
	};

	const supportedEditors = availableEditors.filter(
    (e) => e.id === 'trae' || e.id === 'cursor'
  );
  const installedEditors = supportedEditors.filter((e) => e.installed);
  const displayEditors =
    installedEditors.length > 0 ? installedEditors : supportedEditors;

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 group">
      <div className="p-2 bg-white rounded-md shadow-sm text-indigo-600 group-hover:text-indigo-700">
        <Edit3 className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5 block">
            Editor
          </label>
          {isLoadingEditors ? (
            <div className="flex items-center gap-2 text-gray-600 h-8">
              <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs">Checking...</span>
            </div>
          ) : displayEditors.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {displayEditors.map((editor) => {
                const iconPath = EDITOR_ICONS[editor.id];
                return (
                  <TooltipProvider key={editor.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-gray-600 hover:text-indigo-600 hover:border-indigo-300"
                          onClick={() => handleOpenInEditor(editor.id)}
                        >
                          <img
                            src={iconPath}
                            alt={editor.name}
                            className="w-4 h-4"
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{editor.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">
              No Editor Found
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default EditorSelector;
