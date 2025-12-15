export function toPlainText(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^>\s?/gm, '')
		.replace(/[#*_~>-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function toMetaDescription(markdown: string, maxLength = 160): string {
	const text = toPlainText(markdown);
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).trim()}…`;
}
