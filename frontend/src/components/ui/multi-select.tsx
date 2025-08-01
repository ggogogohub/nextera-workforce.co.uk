import React, { useState, useRef } from 'react';
import { X, ChevronDown, Plus } from 'lucide-react';

interface MultiSelectProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  creatable?: boolean;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ options, value, onChange, placeholder = 'Select...', creatable = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(
    (opt) => opt.toLowerCase().includes(search.toLowerCase()) && !value.includes(opt)
  );

  const handleSelect = (option: string) => {
    if (!value.includes(option)) {
      onChange([...value, option]);
      setSearch('');
      setInputValue('');
    }
  };

  const handleRemove = (option: string) => {
    onChange(value.filter((v) => v !== option));
  };

  const handleCreate = () => {
    const newOption = inputValue.trim();
    if (newOption && !options.includes(newOption) && !value.includes(newOption)) {
      onChange([...value, newOption]);
      setInputValue('');
      setSearch('');
    }
  };

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex flex-wrap items-center gap-1 border rounded-lg px-3 py-2 bg-white dark:bg-slate-900 min-h-[42px] cursor-pointer focus-within:ring-2 ring-blue-500 transition-all ${isOpen ? 'ring-2 ring-blue-500' : ''}`}
        tabIndex={0}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setIsOpen((open) => !open);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {value.length === 0 && (
          <span className="text-gray-400 select-none">{placeholder}</span>
        )}
        {value.map((val) => (
          <span key={val} className="flex items-center bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 rounded px-2 py-1 text-xs mr-1 mb-1">
            {val}
            <button
              type="button"
              className="ml-1 text-blue-500 hover:text-blue-700 focus:outline-none"
              aria-label={`Remove ${val}`}
              onClick={e => { e.stopPropagation(); handleRemove(val); }}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <span className="ml-auto flex items-center">
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </span>
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border rounded-lg shadow-lg max-h-60 overflow-auto animate-fade-in">
          <div className="p-2">
            <input
              type="text"
              className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-slate-800"
              placeholder="Search or add..."
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value);
                setSearch(e.target.value);
              }}
              onKeyDown={e => {
                if (creatable && e.key === 'Enter' && inputValue.trim() && !options.includes(inputValue.trim()) && !value.includes(inputValue.trim())) {
                  handleCreate();
                  e.preventDefault();
                }
              }}
              autoFocus
            />
          </div>
          <ul className="max-h-40 overflow-auto">
            {filteredOptions.length === 0 && !creatable && (
              <li className="px-4 py-2 text-gray-400 text-sm select-none">No options</li>
            )}
            {filteredOptions.map((opt) => (
              <li
                key={opt}
                className="px-4 py-2 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer text-sm"
                onClick={() => handleSelect(opt)}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') handleSelect(opt); }}
                role="option"
                aria-selected={value.includes(opt)}
              >
                {opt}
              </li>
            ))}
            {creatable && inputValue.trim() && !options.includes(inputValue.trim()) && !value.includes(inputValue.trim()) && (
              <li
                className="px-4 py-2 flex items-center gap-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer text-sm"
                onClick={handleCreate}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                role="option"
                aria-selected={false}
              >
                <Plus className="w-4 h-4" /> Add "{inputValue.trim()}"
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}; 