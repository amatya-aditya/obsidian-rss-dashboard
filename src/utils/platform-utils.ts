

export function sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

export function formatRelativeTime(date: Date | string): string {
    const now = new Date();
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    
    
    if (isNaN(targetDate.getTime())) {
        return 'Invalid date';
    }
    
    
    if (now.toDateString() === targetDate.toDateString()) {
        return 'Today';
    }
    
    const diffInMs = now.getTime() - targetDate.getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInWeeks = Math.floor(diffInDays / 7);
    const diffInMonths = Math.floor(diffInDays / 30);
    const diffInYears = Math.floor(diffInDays / 365);
    
    
    if (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) {
        try {
            const rtf = new Intl.RelativeTimeFormat('en', { 
                numeric: 'auto',
                style: 'long'
            });
            
            if (diffInYears > 0) {
                return rtf.format(-diffInYears, 'year');
            } else if (diffInMonths > 0) {
                return rtf.format(-diffInMonths, 'month');
            } else if (diffInWeeks > 0) {
                return rtf.format(-diffInWeeks, 'week');
            } else if (diffInDays > 0) {
                return rtf.format(-diffInDays, 'day');
            } else if (diffInHours > 0) {
                return rtf.format(-diffInHours, 'hour');
            } else if (diffInMinutes > 0) {
                return rtf.format(-diffInMinutes, 'minute');
            } else {
                return rtf.format(-diffInSeconds, 'second');
            }
        } catch {
            // Fall through to manual formatting if Intl.RelativeTimeFormat fails
        }
    }
    
    
    if (diffInYears > 0) {
        return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
    } else if (diffInMonths > 0) {
        return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
    } else if (diffInWeeks > 0) {
        return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
    } else if (diffInDays > 0) {
        return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    } else if (diffInHours > 0) {
        return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else if (diffInMinutes > 0) {
        return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}


export function formatDateWithRelative(date: Date | string): { text: string; title: string } {
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const relativeTime = formatRelativeTime(targetDate);
    const absoluteDate = targetDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    return {
        text: relativeTime,
        title: absoluteDate
    };
}

export function ensureUtf8Meta(html: string): string {
    if (!/^\s*<meta[^>]+charset=/i.test(html)) {
        return '<meta charset="UTF-8">' + html;
    }
    return html;
}

/**
 * Set CSS custom properties on an element
 * @param element The HTML element to set properties on
 * @param props An object with CSS property names as keys and values
 */
export function setCssProps(element: HTMLElement, props: Record<string, string>): void {
    for (const [property, value] of Object.entries(props)) {
        element.style.setProperty(property, value);
    }
}
