type NotificationType = 'request' | 'handover' | 'assignment';

interface NotificationPayload {
  type: NotificationType;
  userId: string;
  message: string;
  data?: any;
}

export async function triggerNotification(payload: NotificationPayload): Promise<void> {
  try {
    const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
    const token = localStorage.getItem('authToken');
    
    // Prüfe, ob Benachrichtigungen für diesen User aktiviert sind
    const userPrefs = await getUserPreferences(payload.userId);
    const notifications = userPrefs?.notifications;
    
    if (!notifications) return;
    
    // Prüfe, ob der spezifische Benachrichtigungstyp aktiviert ist
    let isEnabled = false;
    switch (payload.type) {
      case 'request':
        isEnabled = notifications.requests;
        break;
      case 'handover':
        isEnabled = notifications.handovers;
        break;
      case 'assignment':
        isEnabled = notifications.assignments;
        break;
    }
    
    if (!isEnabled) return;
    
    // Sende Benachrichtigung an Backend
    if (notifications.email) {
      await sendEmailNotification(payload);
    }
    
    if (notifications.push) {
      await sendPushNotification(payload);
    }
    
  } catch (error) {
    console.error('Fehler beim Senden der Benachrichtigung:', error);
  }
}

async function getUserPreferences(userId: string): Promise<any> {
  try {
    const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
    const token = localStorage.getItem('authToken');
    
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const json = await res.json();
    if (!res.ok || !json?.success) return null;
    
    const user = json.users.find((u: any) => u.id === userId);
    return user?.preferences || null;
  } catch {
    return null;
  }
}

async function sendEmailNotification(payload: NotificationPayload): Promise<void> {
  // TODO: E-Mail-Benachrichtigung implementieren
  console.log('E-Mail-Benachrichtigung:', payload);
}

async function sendPushNotification(payload: NotificationPayload): Promise<void> {
  // TODO: Push-Benachrichtigung implementieren
  console.log('Push-Benachrichtigung:', payload);
}

// Hilfsfunktionen für die Anwendung
export const notificationHelpers = {
  async onRequestCreated(requestId: string, requesterId: string) {
    await triggerNotification({
      type: 'request',
      userId: requesterId,
      message: 'Neue Tauschanfrage erhalten',
      data: { requestId }
    });
  },
  
  async onHandoverUpdated(handoverId: string, affectedUserId: string) {
    await triggerNotification({
      type: 'handover',
      userId: affectedUserId,
      message: 'Übergabe wurde aktualisiert',
      data: { handoverId }
    });
  },
  
  async onAssignmentCreated(assignmentId: string, caretakerId: string) {
    await triggerNotification({
      type: 'assignment',
      userId: caretakerId,
      message: 'Neue Betreuung zugewiesen',
      data: { assignmentId }
    });
  }
};
