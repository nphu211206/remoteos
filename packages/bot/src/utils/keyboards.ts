/**
 * Shared keyboard utilities for Telegram bot
 */

/**
 * Main menu keyboard with common actions
 */
export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🖥️ Status', callback_data: 'cmd:status' },
        { text: '📸 Screenshot', callback_data: 'cmd:screenshot' },
      ],
      [
        { text: '🔧 Processes', callback_data: 'cmd:process_list' },
        { text: '💻 System Info', callback_data: 'cmd:system_info' },
      ],
      [
        { text: '📁 Files', callback_data: 'cmd:file_list' },
        { text: '📋 Clipboard', callback_data: 'cmd:get_clipboard' },
      ],
      [
        { text: '🔒 Lock', callback_data: 'cmd:lock_screen' },
        { text: '🔔 Notify', callback_data: 'action:notify' },
      ],
      [
        { text: '📱 Devices', callback_data: 'action:devices' },
        { text: '❓ Help', callback_data: 'action:help' },
      ],
    ],
  };
}
