const { getScale, changeScale } = (() => {
  const scales = [0.5, 1, 2];
  let currentScale = 1;

  function getScale() {
    return currentScale;
  }

  function changeScale() {
    const currentIndex = scales.findIndex((item) => item === currentScale);
    const nextIndex = currentIndex + 1;
    currentScale = nextIndex === scales.length ? scales[0] : scales[nextIndex];
    return currentScale;
  }

  return { getScale, changeScale };
})();

const { showNotify, closeNotify } = (() => {
  let notify: NotificationHandler | null = null;

  function closeNotify() {
    if (notify) {
      notify.cancel();
      notify = null;
    }
  }

  function showNotify(text: string, settings: NotificationOptions) {
    closeNotify();
    setTimeout(() => (notify = figma.notify(text, settings)), 10);
  }

  return { showNotify, closeNotify };
})();

const { initLocker, changeLocker, clearLocker } = (() => {
  let interval: number | null = null;

  function initLocker() {
    interval = setInterval(() => {
      figma.viewport.zoom = getScale();
    }, 14);
  }

  function changeLocker() {
    if (interval) clearInterval(interval);
    const scale = changeScale();
    setTimeout(() => {
      interval = setInterval(() => {
        figma.viewport.zoom = scale;
      }, 14);
    }, 10);
  }

  function clearLocker() {
    if (interval) clearInterval(interval);
  }

  return { initLocker, changeLocker, clearLocker };
})();

function updateScale() {
  const currentScale = getScale();
  showNotify("Zoom is locked", {
    timeout: Infinity,
    button: {
      text: `${currentScale}x`,
      action: () => {
        changeLocker();
        updateScale();
      },
    },
    onDequeue: (reason) => {
      if (reason !== "action_button_click") {
        clearLocker();
        closeNotify();
        figma.closePlugin();
      }
    },
  });
}

async function checkSubscription(email?: string) {
  const userId = figma.currentUser?.id || "";
  let uri = `https://mcrprdcts.eduhund.com/api/fixiq/check_subscription?user_id=${userId}`;

  if (email) {
    uri += `&email=${email}`;
  }
  try {
    const response = await fetch(uri, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status !== 200) {
      showNotify(
        "We have some problem. Please, run plugin again, or mail us: we@eduhund.com",
        {
          error: true,
          timeout: 10 * 1000,
          onDequeue: () => {
            figma.closePlugin();
          },
        }
      );
      return null;
    }

    const data = await response.json();
    return data?.access;
  } catch {
    console.error("Subscribtion check error:");
    figma.closePlugin();
  }
}

async function run() {
  figma.showUI(__html__, { visible: false, width: 280, height: 480 });
  showNotify("Cheking your subscription...", {
    timeout: Infinity,
  });

  const result = await checkSubscription();

  if (result === null) {
    return;
  }

  if (result) {
    initLocker();
    updateScale();
  } else {
    initLocker();

    const timeFromFirstRun = figma?.payments?.getUserFirstRanSecondsAgo() || 0;

    if (timeFromFirstRun > 3 * 24 * 60 * 60) {
      clearLocker();
      showNotify("You have reached 3 days free trial", {
        timeout: Infinity,
        button: {
          text: "Get full version",
          action: () => {
            figma.ui.show();
          },
        },
        onDequeue: (reason) => {
          if (reason !== "action_button_click") {
            clearLocker();
            closeNotify();
            figma.closePlugin();
          }
        },
      });
    } else {
      showNotify("Zoom is locked (free trial)", {
        timeout: 300 * 1000,
        button: {
          text: "Get full version",
          action: () => {
            figma.ui.show();
          },
        },
        onDequeue: (reason) => {
          if (reason === "timeout") {
            showNotify("You have reached 5 minutes lock limit", {
              timeout: Infinity,
              button: {
                text: "Get full version",
                action: () => {
                  figma.ui.show();
                },
              },
              onDequeue: (reason) => {
                if (reason !== "action_button_click") {
                  clearLocker();
                  closeNotify();
                  figma.closePlugin();
                }
              },
            });
            clearLocker();
          }
          if (reason === "dismiss") {
            clearLocker();
            closeNotify();
            figma.closePlugin();
          }
        },
      });
    }
  }
}

run();

figma.ui.onmessage = async (message) => {
  const { type } = message;

  switch (type) {
    case "checkEmail": {
      const { email } = message;
      const result = await checkSubscription(email);

      if (result) {
        updateScale();
        figma.ui.hide();
      } else {
        figma.ui.postMessage({ type: "invalidEmail" });
      }
    }
  }
};
