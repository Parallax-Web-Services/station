import source from '../resources/ecosystem.json' with { type: 'json' };

function deepFreeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

export const catalog = deepFreeze(source);

export function safeHref(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048 || value !== value.trim() || /[\\\u0000-\u0020\u007f]/.test(value)) {
        throw new TypeError('Invalid ecosystem destination');
    }
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    if (!/^https?:\/\//i.test(value)) throw new TypeError('Invalid ecosystem destination');
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
        throw new TypeError('Invalid ecosystem destination');
    }
    return value;
}

export function findProduct(key) {
    return catalog.products.find(product => product.key === key || product.aliases.includes(key)) ?? null;
}

export function resolveEcosystem({ resolveLink, navigation, assetBase, assetUrls = {} } = {}) {
    const providedLink = context => {
        if (!navigation || typeof navigation !== 'object') return undefined;
        if (context.group === 'products' || context.group === 'shared') {
            const product = context.group === 'shared' ? navigation.shared : navigation.products?.find(item => item.key === context.productKey);
            return context.id === 'home' ? product?.href : product?.links?.find(item => item.id === context.id)?.href;
        }
        return navigation[context.group === 'legacy' ? 'legacyTools' : context.group]?.find(item => item.id === context.id)?.href;
    };
    const destination = (item, group, productKey = null) => {
        const context = { id: item.id ?? 'home', href: item.href, group, productKey };
        return safeHref(resolveLink?.(context) ?? providedLink(context) ?? item.href);
    };
    const icon = product => safeHref(assetUrls[product.key] ?? (assetBase ? `${assetBase.replace(/\/$/, '')}/${product.brand.asset}` : product.brand.url));
    const product = (item, group) => ({
        ...item,
        icon: icon(item),
        href: destination(item, group, item.key),
        links: item.links.map(link => ({ ...link, href: destination(link, group, item.key) })),
    });
    const links = (items, group) => items.map(item => ({ ...item, href: destination(item, group) }));
    return {
        schemaVersion: catalog.schema_version,
        products: catalog.products.map(item => product(item, 'products')),
        shared: product(catalog.shared, 'shared'),
        commands: links(catalog.commands, 'commands'),
        legacyTools: links(catalog.legacy_tools, 'legacy'),
    };
}
