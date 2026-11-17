import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { findProduct, resolveEcosystem, safeHref } from '../index.js';
import { brandAssets } from '../brand-assets.js';

const searchable = item => `${item.name ?? item.label} ${item.role ?? ''} ${item.description ?? ''}`.toLowerCase();
const Icon = ({ kind, ...props }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
    {kind === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : kind === 'close' ? <path d="m6 6 12 12M6 18 18 6" /> : kind === 'external' ? <path d="M7 17 17 7M7 7h10v10" /> : <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /></>}
</svg>;

export function WorkspaceLauncher({ currentProduct, currentName, currentUrl, trigger, resolveLink, navigation, assetBase, assetUrls, className = '', linkComponent: Link = 'a', accent, shortcut = true, presentation = 'dialog', additionalProducts = [], onOpenChange }) {
    const inline = presentation === 'inline';
    const ecosystem = useMemo(() => {
        const source = resolveEcosystem({ resolveLink, navigation, assetBase, assetUrls: assetUrls ?? (assetBase ? {} : brandAssets) });
        const known = new Set(source.products.map(product => product.key));
        const extra = additionalProducts.filter(product => !known.has(product.key)).map(product => ({ ...product, href: safeHref(product.href), icon: safeHref(product.icon), links: product.links.map(link => ({ ...link, href: safeHref(link.href) })) }));
        return { ...source, products: [...source.products, ...extra] };
    }, [resolveLink, navigation, assetBase, assetUrls, additionalProducts]);
    const activeKey = findProduct(currentProduct)?.key ?? currentProduct;
    const active = ecosystem.products.find(product => product.key === activeKey) ?? ecosystem.shared;
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [shortcutLabel, setShortcutLabel] = useState('Ctrl K');
    const searchRef = useRef(null);
    const triggerRef = useRef(null);
    const query = search.trim().toLowerCase();
    const close = () => setOpen(false);
    const show = () => { setSearch(''); setOpen(true); };

    useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

    useEffect(() => {
        setShortcutLabel(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
        if (!shortcut || inline) return;
        const handle = event => {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k' && triggerRef.current?.getClientRects().length) {
                event.preventDefault();
                setSearch('');
                setOpen(previous => !previous);
            }
        };
        document.addEventListener('keydown', handle);
        return () => document.removeEventListener('keydown', handle);
    }, [shortcut, inline]);

    const products = ecosystem.products.map(product => {
        const matches = !query || searchable(product).includes(query);
        const links = matches ? product.links : product.links.filter(link => searchable(link).includes(query));
        return { ...product, links, visible: matches || links.length > 0 };
    }).filter(product => product.visible);
    const assets = !query || searchable(ecosystem.shared).includes(query) ? ecosystem.shared.links : ecosystem.shared.links.filter(link => searchable(link).includes(query));
    const allCommands = ecosystem.commands;
    const commands = !query || 'command deck'.includes(query) ? allCommands : allCommands.filter(link => searchable(link).includes(query));
    const count = products.length + assets.length + commands.length;
    const isCurrent = href => {
        if (typeof window === 'undefined') return false;
        const current = new URL(currentUrl ?? window.location.href, window.location.origin);
        const destination = new URL(href, window.location.origin);
        return current.origin === destination.origin && current.pathname === destination.pathname && current.searchParams.get('kind') === destination.searchParams.get('kind');
    };
    const itemLink = (link, extraClass = '') => <Link key={link.id} href={link.href} onClick={close} aria-current={isCurrent(link.href) ? 'page' : undefined} className={`parallax-launcher-tool ${extraClass}`}>{link.label}</Link>;

    const contents = <>
                    <header className="parallax-launcher-header">
                        <Icon kind="grid" />{inline ? <h2>Apps and capabilities</h2> : <DialogTitle>Workspaces</DialogTitle>}
                        {!inline && <button type="button" onClick={close} aria-label="Close workspace menu" className="parallax-launcher-close"><Icon kind="close" /></button>}
                    </header>
                    <div className="parallax-launcher-body">
                        <label className="parallax-launcher-search">
                            <span className="parallax-launcher-sr">Find a workspace or tool</span><Icon kind="search" />
                            <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a workspace or tool" />
                            {shortcut && <kbd aria-hidden="true">{shortcutLabel}</kbd>}
                        </label>
                        <div role="status" className="parallax-launcher-sr">{query ? `${count} matching groups and tools.` : 'All workspaces and shared tools.'}</div>
                        {products.length > 0 && <section aria-label={inline ? "Applications and workspaces" : "Executive workspaces"} className="parallax-launcher-products">
                            {products.map(product => <article key={product.key} data-product={product.key} data-active={activeKey === product.key || undefined} className="parallax-launcher-card" style={{ '--parallax-product-accent': product.accent }}>
                                <Link href={product.href} onClick={close} aria-current={isCurrent(product.href) ? 'page' : undefined} className="parallax-launcher-product">
                                    <span className="parallax-launcher-mark"><img src={product.icon} alt="" /></span>
                                    <span><strong>{product.name}</strong><small>{product.role}</small></span>
                                    {activeKey === product.key ? <span className="parallax-launcher-current" aria-label="Current workspace" /> : <Icon kind="external" />}
                                </Link>
                                <p>{product.description}</p>
                                <nav aria-label={`${product.name} tools`} className="parallax-launcher-tools">{product.links.map(link => itemLink(link))}</nav>
                            </article>)}
                        </section>}
                        {(assets.length > 0 || commands.length > 0) && <div className="parallax-launcher-shared">
                            {assets.length > 0 && <section aria-labelledby="parallax-assets-heading" style={{ '--parallax-product-accent': ecosystem.shared.accent }}><h3 id="parallax-assets-heading"><img src={ecosystem.shared.icon} alt="" />Parallax assets</h3><nav aria-label="Parallax shared assets" className="parallax-launcher-tools">{assets.map(link => itemLink(link))}</nav></section>}
                            {commands.length > 0 && <section aria-labelledby="parallax-command-heading"><h3 id="parallax-command-heading">Command Deck</h3><nav aria-label="Global Command Deck" className="parallax-launcher-tools">{commands.map(link => itemLink(link))}</nav></section>}
                        </div>}
                        {count === 0 && <p className="parallax-launcher-empty">No workspace or tool matches “{search}”.</p>}
                    </div>
                    <footer className="parallax-launcher-footer"><span>Current workspace: {currentName ?? active.name}</span><span>{inline ? 'Open tools in Station tabs' : <><kbd>Esc</kbd> to close</>}</span></footer>
    </>;
    if (inline) return <main className={`parallax-launcher parallax-launcher-inline ${className}`} style={{ '--parallax-launcher-accent': accent ?? active.accent }}>
        <section className="parallax-launcher-panel">{contents}</section>
    </main>;

    return <>
        <button ref={triggerRef} type="button" className={`parallax-launcher-trigger ${className}`} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
            {trigger ?? <><img src={active.icon} alt="" /><span>{currentName ?? active.name}</span><Icon kind="grid" /></>}
            <span className="parallax-launcher-sr">Open Parallax ecosystem</span>
        </button>
        <Dialog open={open} onClose={close} initialFocus={searchRef} className="parallax-launcher" style={{ '--parallax-launcher-accent': accent ?? active.accent }}>
            <DialogBackdrop transition className="parallax-launcher-backdrop" />
            <div className="parallax-launcher-viewport">
                <DialogPanel transition className="parallax-launcher-panel">
                    {contents}
                </DialogPanel>
            </div>
        </Dialog>
    </>;
}

export default WorkspaceLauncher;
