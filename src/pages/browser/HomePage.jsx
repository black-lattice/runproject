function HomePage({ sites, onOpenSite, onEditSite, onDeleteSite }) {
    return (
        <div className='h-full w-full bg-gray-50 overflow-auto p-4'>
            <div className='flex flex-wrap gap-3'>
                {(sites || []).map(site => (
                    <div
                        key={site.id}
                        className='relative w-20 h-20 rounded-lg border bg-white hover:bg-gray-50'>
                        <button
                            className='w-full h-full flex items-center justify-center text-sm font-medium text-gray-900 px-2 text-center leading-tight'
                            onClick={() => onOpenSite(site.url)}
                            title={site.url}>
                            {site.title}
                        </button>

                        <button
                            className='absolute top-1 left-1 text-xs text-gray-400 hover:text-gray-700'
                            onClick={e => {
                                e.stopPropagation();
                                onEditSite(site);
                            }}
                            title='编辑'>
                            ✎
                        </button>

                        <button
                            className='absolute top-1 right-1 text-xs text-gray-400 hover:text-red-600'
                            onClick={e => {
                                e.stopPropagation();
                                onDeleteSite(site.id);
                            }}
                            title='删除'>
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default HomePage;


