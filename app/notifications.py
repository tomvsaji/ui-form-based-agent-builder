import os
import smtplib
from email.message import EmailMessage
from typing import Dict, Optional


def send_email(subject: str, body: str, to_email: str) -> Dict[str, str]:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    from_email = os.getenv("SMTP_FROM") or user
    if not host or not user or not password or not from_email:
        raise RuntimeError("SMTP credentials are not configured.")

    use_ssl = os.getenv("SMTP_USE_SSL", "").lower() == "true" or port == 465
    use_tls = os.getenv("SMTP_USE_TLS", "").lower() != "false" and port != 465

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_email
    message["To"] = to_email
    message.set_content(body)

    if use_ssl:
        server = smtplib.SMTP_SSL(host, port, timeout=10)
    else:
        server = smtplib.SMTP(host, port, timeout=10)

    try:
        server.ehlo()
        if use_tls:
            server.starttls()
            server.ehlo()
        server.login(user, password)
        server.send_message(message)
    finally:
        server.quit()

    return {"status": "sent", "to": to_email}
