import UIKit

/// Native launch splash shown the instant the app process starts, before the
/// WKWebView has anything to render. Mirrors the web splash in www/index.html
/// (logo, random tagline, cycling dots) so there's no visual gap or mismatch
/// between the two — this one just runs natively so it's on screen immediately
/// instead of waiting on WebView/Babel boot time.
final class NativeSplashViewController: UIViewController {

    /// How long the native splash stays on screen before handing off to the app.
    /// Matches the web splash's own SPLASH_DURATION so the brand timing feels
    /// consistent regardless of which layer happened to render it.
    static let minimumDuration: TimeInterval = 2.5

    /// Called once minimumDuration has elapsed. The caller (AppDelegate) is
    /// responsible for swapping in the real app content.
    var onFinished: (() -> Void)?

    private let taglines = [
        "make something beautiful",
        "your makes, your way",
        "craft your story",
        "stitch by stitch",
        "for the love of making"
    ]

    private let accentColor = UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0x9B / 255.0, green: 0x93 / 255.0, blue: 0xAE / 255.0, alpha: 1)
            : UIColor(red: 0x77 / 255.0, green: 0x8E / 255.0, blue: 0xE3 / 255.0, alpha: 1)
    }

    private let logoImageView: UIImageView = {
        let iv = UIImageView(image: UIImage(named: "SplashLogo"))
        iv.contentMode = .scaleAspectFit
        iv.alpha = 0
        iv.translatesAutoresizingMaskIntoConstraints = false
        return iv
    }()

    private let taglineLabel = UILabel()
    private let taglineRow = UIStackView()
    private var dotViews: [UIView] = []
    private var dotStep = 0
    private var dotTimer: Timer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        layoutBackground()
        layoutContent()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        animateEntrance()
        startDotCycle()
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.minimumDuration) { [weak self] in
            self?.onFinished?()
        }
    }

    deinit {
        dotTimer?.invalidate()
    }

    // MARK: - Layout

    private func layoutBackground() {
        // Same asset the LaunchScreen.storyboard uses (background + blobs, no
        // logo baked in), so there is zero visual seam between the OS-level
        // launch image and this view taking over.
        let background = UIImageView(image: UIImage(named: "Splash"))
        background.contentMode = .scaleAspectFill
        background.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(background)
        NSLayoutConstraint.activate([
            background.topAnchor.constraint(equalTo: view.topAnchor),
            background.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            background.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            background.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func layoutContent() {
        taglineLabel.font = .systemFont(ofSize: 14, weight: .semibold)
        taglineLabel.textColor = accentColor
        taglineLabel.text = taglines.randomElement()

        dotViews = (0..<3).map { _ in makeDot() }
        let dotsRow = UIStackView(arrangedSubviews: dotViews)
        dotsRow.axis = .horizontal
        dotsRow.spacing = 3
        dotsRow.alignment = .center

        taglineRow.axis = .horizontal
        taglineRow.spacing = 6
        taglineRow.alignment = .center
        taglineRow.alpha = 0
        taglineRow.addArrangedSubview(taglineLabel)
        taglineRow.addArrangedSubview(dotsRow)

        let contentStack = UIStackView(arrangedSubviews: [logoImageView, taglineRow])
        contentStack.axis = .vertical
        contentStack.spacing = 12
        contentStack.alignment = .center
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(contentStack)

        NSLayoutConstraint.activate([
            contentStack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            contentStack.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -40),
            logoImageView.widthAnchor.constraint(equalToConstant: 150),
            // Matches the cropped SplashLogo asset's aspect ratio (894x808).
            logoImageView.heightAnchor.constraint(equalTo: logoImageView.widthAnchor, multiplier: 808.0 / 894.0)
        ])
    }

    private func makeDot() -> UIView {
        let dot = UIView()
        dot.backgroundColor = accentColor
        dot.alpha = 0
        dot.layer.cornerRadius = 2.5
        dot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 5),
            dot.heightAnchor.constraint(equalToConstant: 5)
        ])
        return dot
    }

    // MARK: - Animation

    private func animateEntrance() {
        logoImageView.transform = CGAffineTransform(translationX: 0, y: 14)
        UIView.animate(withDuration: 0.5, delay: 0.1, options: [.curveEaseOut], animations: {
            self.logoImageView.alpha = 1
            self.logoImageView.transform = .identity
        })

        taglineRow.transform = CGAffineTransform(translationX: 0, y: 14)
        UIView.animate(withDuration: 0.45, delay: 0.35, options: [.curveEaseOut], animations: {
            self.taglineRow.alpha = 1
            self.taglineRow.transform = .identity
        })
    }

    /// Cycles the loading dots • → •• → ••• → (none) → •, every 500ms — the
    /// same cadence and step sequence as the web splash's dot animation.
    private func startDotCycle() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in
            guard let self = self else { return }
            self.advanceDots()
            self.dotTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                self?.advanceDots()
            }
        }
    }

    private func advanceDots() {
        for (index, dot) in dotViews.enumerated() {
            dot.alpha = index < dotStep ? 1 : 0
        }
        dotStep = (dotStep + 1) % 4
    }
}
