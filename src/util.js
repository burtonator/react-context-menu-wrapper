/**
 * @author v1ndic4te
 * @copyright 2018
 * @licence GPL-3.0
 */

export function warn(/*arguments*/) {
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[react-context-menu-wrapper]');
    console.warn.apply(this, args);
}

export const EventName = {
    TryShowContextMenu: 'react-context-menu-wrapper-try-show',
    DoShowContextMenu: 'react-context-menu-wrapper-do-show',
    HideAllContextMenus: 'react-context-menu-wrapper-hide-all',
};

export const TriggerType = {
    Manual: 'manual', // When context menu is requested programmatically
    Native: 'native', // When context menu is requested via an input event
};

export const TriggerContext = {
    Local: 'local', // When requested via a local listener
    Global: 'global', // When requested via a global listener
    Cancel: 'cancel', // When requested a cancel event is manually requested
};

export function getPropertySize(node, property) {
    try {
        const value = window.getComputedStyle(node).getPropertyValue(property);
        return +value.replace(/[^\d.]+/g, '');
    } catch (error) {
        // Bad property, object, doesn't matter.
        return 0;
    }
}

export function windowExists() {
    return typeof window !== 'undefined';
}

export function initWindowState() {
    if (window._reactContextMenuWrapperData) return;

    window._reactContextMenuWrapper = {
        globalMenus: [], // Array of IDs of menus that are currently global
        lastTriggerDataMap: {}, // Map of event IDs to their last 'context-menu' events
        intentTimeout: null, // Holds the debounce timeout for context menu show intents
        intentWinner: null, // Holds the deepest menu intent at the moment debounce is triggered
    };

    document.addEventListener('contextmenu', globalContextMenuListener);
}

export function generateInternalId() {
    return Math.random().toString(36).substring(6);
}

export function registerGlobalContextMenu(internalId) {
    const menus = window._reactContextMenuWrapper.globalMenus;
    if (menus.length !== 0) {
        warn('You have registered multiple global context menus - menus will likely display incorrectly. It\'s ' +
            'recommended you only have one global context menu.');
    }
    menus.push(internalId);
}

export function removeGlobalContextMenu(internalId) {
    const menus = window._reactContextMenuWrapper.globalMenus;

    let index = menus.indexOf(internalId);
    if (index > -1) {
        menus.splice(index, 1);
    }
}

export function dispatchWindowEvent(eventName, detail = {}) {
    let event;
    if (typeof window.CustomEvent === 'function') {
        event = new window.CustomEvent(eventName, {detail});
    } else {
        event = document.createEvent('CustomEvent');
        event.initCustomEvent(eventName, false, true, detail);
    }
    window.dispatchEvent(event);
}

const notifyIntentWinner = () => {
    const store = window._reactContextMenuWrapper;
    const winner = store.intentWinner;
    store.intentTimeout = null;
    store.intentWinner = null;
    if (!winner) return;

    if (winner.eventDetails.triggerContext === TriggerContext.Cancel) {
        // Current show intent is a cancel command, do nothing.
        return;
    }

    dispatchWindowEvent(EventName.DoShowContextMenu, winner);
};

/**
 * Called by 'ContextMenuWrapper' instances when they receive a show request. This method is responsible for resolving
 * which context menu should actually be shown.
 *
 * Chooses the context menu associated with the bottom-most DOM node in the tree.
 *
 * @param {object} data
 * @param {string} [data.internalId]
 * @param {string} [data.externalId]
 * @param {*} data.eventDetails       The object that triggered the context menu event.
 * @param {*} [data.data]             Data associated with the trigger.
 */
export function registerShowIntent(data) {
    const store = window._reactContextMenuWrapper;

    // We know that whoever submitted the show intent is ready to show the context menu. Whether they win or not,
    // we can prevent the default behaviour of the event.
    if (data.eventDetails.preventDefault) data.eventDetails.preventDefault();

    if (store.intentWinner) {
        const ourDetails = data.eventDetails;
        const otherDetails = store.intentWinner.eventDetails;

        if (otherDetails.triggerContext === TriggerContext.Cancel) {
            // Do nothing because cancel commands always take precedence.
        } else if (ourDetails.triggerType === TriggerType.Manual) {
            // Do nothing because manual events always take precedence
            // (unless the previous event is a manual cancel command.
        } else if (ourDetails.triggerContext === TriggerContext.Global) {
            // Either the existing trigger is also global (which means it will be identical to us) or it is local,
            // in which case we would lose. Either way, we can just return.
            return;
        } else {
            const ourSource = ourDetails.triggerSource;
            const otherSource = otherDetails.triggerSource;

            if (!ourSource || !otherSource) {
                // If we got here, it means that we were triggered by a native event that didn't have proper targets
                // specified. The only thing we can do is just give up and assume the current intent lost.
                return;
            }

            // If we have higher precedence than our opponent, we win the intent.
            if (ourSource.contains(otherSource)) {
                return;
            }
        }

        // TODO: Handle the weird case when none of the sources contain the other.
    }

    store.intentWinner = data;
    clearTimeout(store.intentTimeout);
    store.intentTimeout = setTimeout(notifyIntentWinner, 5);
}

export function setLastTriggerData(internalId, data) {
    const map = window._reactContextMenuWrapper.lastTriggerDataMap;
    map[internalId] = data;
}

export function getLastTriggerData(internalId) {
    const map = window._reactContextMenuWrapper.lastTriggerDataMap;
    return map[internalId];
}

/**
 * @param {object} data
 * @param {string} [data.id]    External ID of the context menu
 * @param {object} [data.data]  Data associated with the event
 * @param {*} [data.event]      ContextMenu event that triggered the logic
 * @param {*} [data.x]          x-coordinate to show the menu at
 * @param {*} [data.y]          y-coordinate to show the menu at
 */
export const showContextMenu = (data) => {
    const eventDetails = {
        triggerType: TriggerType.Manual,
        triggerContext: data.id ? TriggerContext.Local : TriggerContext.Global,
        preventDefault: () => event.preventDefault(),
        triggerSource: null,
        triggerTarget: null,
        x: 0,
        y: 0,
    };
    if (data.event) {
        eventDetails.triggerSource = event.currentTarget;
        eventDetails.triggerTarget = event.target;
        eventDetails.x = event.clientX;
        eventDetails.y = event.clientY;
    }
    if (data.x) eventDetails.x = data.x;
    if (data.y) eventDetails.y = data.y;
    dispatchWindowEvent(EventName.TryShowContextMenu, {eventDetails, externalId: data.id, data: data.data});
};

export function hideAllContextMenus() {
    dispatchWindowEvent(EventName.HideAllContextMenus);
}

export const cancelOtherContextMenus = event => {
    const eventDetails = {
        triggerType: TriggerType.Manual,
        triggerContext: TriggerContext.Cancel,
    };
    registerShowIntent({eventDetails});
};

/**
 * Prepares an object with handlers for different events
 * @param {string} externalId
 * @param {*} [data]
 */
export const prepareContextMenuHandlers = (externalId, data = null) => {
    return {
        onContextMenu: event => {
            const eventDetails = {
                triggerType: TriggerType.Native,
                triggerContext: TriggerContext.Local,
                preventDefault: () => event.preventDefault(),
                triggerSource: event.currentTarget,
                triggerTarget: event.target,
                x: event.clientX,
                y: event.clientY,
            };
            dispatchWindowEvent(EventName.TryShowContextMenu, {eventDetails, externalId, data});
        },
    };
};

function globalContextMenuListener(event) {
    const eventDetails = {
        triggerType: TriggerType.Native,
        triggerContext: TriggerContext.Global,
        preventDefault: () => event.preventDefault(),
        triggerSource: event.currentTarget,
        triggerTarget: event.target,
        x: event.clientX,
        y: event.clientY,
    };
    dispatchWindowEvent(EventName.TryShowContextMenu, {eventDetails, externalId: null, data: null});
}
