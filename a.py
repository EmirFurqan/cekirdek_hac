import cv2
import numpy as np
import math

def estimate_roll_from_horizon(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Gürültü azaltma
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # Kenar bulma
    edges = cv2.Canny(blur, 50, 150)

    # Hough Transform ile çizgi bulma
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=80,
        minLineLength=100,
        maxLineGap=30
    )

    if lines is None:
        return None, frame

    best_line = None
    best_length = 0

    for line in lines:
        x1, y1, x2, y2 = line[0]

        dx = x2 - x1
        dy = y2 - y1

        if dx == 0:
            continue

        angle = math.degrees(math.atan2(dy, dx))

        # Ufuk çizgisi genelde yataya yakındır
        if abs(angle) < 45:
            length = math.sqrt(dx**2 + dy**2)

            if length > best_length:
                best_length = length
                best_line = (x1, y1, x2, y2, angle)

    if best_line is None:
        return None, frame

    x1, y1, x2, y2, angle = best_line

    # OpenCV görüntü koordinatında y aşağı doğru arttığı için işaret terslenebilir
    roll_angle = -angle

    cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 0), 3)

    cv2.putText(
        frame,
        f"Roll: {roll_angle:.2f} deg",
        (30, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2
    )

    return roll_angle, frame


cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    roll, output = estimate_roll_from_horizon(frame)

    cv2.imshow("Horizon Roll Estimation", output)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()