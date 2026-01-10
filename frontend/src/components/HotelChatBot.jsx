import React, { useEffect } from 'react';
import ChatBot from 'react-chatbotify';

export default function HotelChatBot({ requestId, role = 'guest', userName, status }) {
  // Conversation flow for the chatbot
  const getFlow = () => {
    if (role === 'driver') {
      return {
      return {
        start: {
          message: `Welcome, Driver! 🚐\n\nHow can I help you manage your rides today?`,
          path: "driver_options"
        },
        driver_options: {
          message: "Choose an option:",
          options: [
            {
              label: "📋 View Active Requests",
              value: "view_requests",
              path: "requests_info"
            },
            {
              label: "📍 Location Help",
              value: "location_help",
              path: "location_info"
            },
            {
              label: "❓ Help & Support",
              value: "driver_help",
              path: "driver_help"
            }
          ]
        },
        requests_info: {
          message: "You can view all active ride requests in your dashboard. Each request shows:\n\n• Guest name and location\n• Terminal and gate information\n• ETA to guest location\n• Call and chat options\n• Status update buttons",
          path: "driver_options"
        },
        location_info: {
          message: "📍 Location Sharing Tips:\n\n• Click 'Send Location Once' for immediate update\n• Use 'Start Streaming' for automatic updates every 10 seconds\n• Make sure GPS is enabled on your device\n• Location updates help guests track your arrival",
          path: "driver_options"
        },
        driver_help: {
          message: `Driver Dashboard Guide:\n\n1️⃣ Accept requests from guests\n2️⃣ Start location streaming\n3️⃣ Use 'I'm Here' when you arrive\n4️⃣ Update status: Accepted → Picked Up → Completed\n5️⃣ Use Call/Chat to communicate with guests\n\n📞 Support: 817-545-8108`,
          path: "driver_options"
        }
      };
    }

    }

    return {
      start: {
        message: `Welcome to Super 8 Bedford DFW West Shuttle Service! 🚐\n\nHow can I assist you today?`,
        path: "options"
      },
      options: {
        message: "Choose an option:",
        options: [
          {
            label: "📍 Check My Ride Status",
            value: "check_status",
            path: "status_check"
          },
          {
            label: "⏱️ Estimated Arrival Time",
            value: "eta",
            path: "eta_info"
          },
          {
            label: "🚐 Driver Information",
            value: "driver_info",
            path: "driver_info"
          },
          {
            label: "❓ General Questions",
            value: "help",
            path: "help"
          }
        ]
      },
      status_check: {
        message: () => {
          if (!requestId) {
            return "No active ride request found. Please submit a request first.";
          }
          const statusMessages = {
            pending: "⏳ Your ride request is pending. Our driver will accept it shortly!",
            accepted: "✅ Your ride has been accepted! The driver is on the way.",
            picked_up: "🎉 Great! You've been picked up. Enjoy your ride to the hotel!",
            completed: "🏁 Your ride is completed. Thank you for using our service!"
          };
          return statusMessages[status] || "Your request is being processed.";
        },
        path: "options"
      },
      eta_info: {
        message: "⏱️ Estimated Arrival Time: 45-50 minutes\n\nOur shuttle will pick you up from your location. Please stay tuned - we're on the way! 🚐\n\nThe ETA depends on traffic conditions, but we'll keep you updated in real-time.\n\nIf you need to contact the driver, use the call button in your request card.",
        path: "options"
      },
      driver_info: {
        message: status === 'accepted' || status === 'picked_up' 
          ? "🚐 Your driver is currently en route to your location. You can track their location on the live map.\n\nIf you need to contact them, use the call button or chat feature."
          : "⏳ Your driver will be assigned once your request is accepted. You'll be notified immediately!",
        path: "options"
      },
      help: {
        message: `Here's how our service works:\n\n1️⃣ Submit your ride request with your details\n2️⃣ Wait for driver acceptance (usually within 2-3 minutes)\n3️⃣ Track your driver's location on the map\n4️⃣ Receive SMS notification when driver arrives\n5️⃣ Enjoy your ride to Super 8 Bedford!\n\n📍 Hotel Location: 1700 Airport Freeway, Bedford, TX\n📞 Need immediate help? Call: 817-545-8108`,
        path: "options"
      }
    };
  };

  const flow = getFlow();

  // Customize chatbot settings
  const settings = {
    general: {
      primaryColor: "#6366f1", // Indigo
      secondaryColor: "#8b5cf6", // Purple
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
      showHeader: true,
      showFooter: false,
      showInputRow: true,
      embedded: false,
      flowStartTrigger: "ON_LOAD"
    },
    header: {
      title: "Super 8 Shuttle Assistant",
      showAvatar: true,
      avatar: "🚐",
      buttons: []
    },
    chatWindow: {
      defaultOpen: false,
      showScrollbar: false,
      showTypingIndicator: true,
      autoJumpToBottom: true,
      showMessagePrompt: true
    },
    chatInput: {
      enabledPlaceholderText: "Ask me anything...",
      disabledPlaceholderText: "Chat unavailable",
      botDelay: 800,
      blockSpam: true
    },
    tooltip: {
      mode: "CLOSE",
      text: "Need help? Ask me! 😊"
    },
    chatButton: {
      icon: "💬"
    },
    userBubble: {
      animate: true,
      showAvatar: false
    },
    botBubble: {
      animate: true,
      showAvatar: true,
      avatar: "🚐"
    },
    device: {
      desktopEnabled: true,
      mobileEnabled: true,
      applyMobileOptimizations: true
    }
  };

  return (
    <ChatBot 
      flow={flow} 
      settings={settings}
    />
  );
}
