import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';

/// Shared geometry, typography, and semantic colors for every portal drawer.
class PortalDrawerTheme extends StatelessWidget {
  const PortalDrawerTheme({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    return Theme(
      data: base.copyWith(
        navigationDrawerTheme: NavigationDrawerThemeData(
          tileHeight: 48,
          backgroundColor: kColorBg,
          surfaceTintColor: Colors.transparent,
          indicatorColor: kColorPrimary.withValues(alpha: .09),
          indicatorSize: const Size(336, 44),
          iconTheme: WidgetStateProperty.resolveWith(
            (states) => IconThemeData(
              size: 22,
              color: states.contains(WidgetState.selected)
                  ? kColorPrimary
                  : kColorMutedText,
            ),
          ),
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => GoogleFonts.roboto(
              fontSize: 14,
              height: 1.2,
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w500,
              color: states.contains(WidgetState.selected)
                  ? kColorPrimaryDark
                  : kColorText,
            ),
          ),
        ),
        listTileTheme: ListTileThemeData(
          minTileHeight: 48,
          contentPadding: const EdgeInsets.only(left: 24, right: 12),
          minLeadingWidth: 22,
          horizontalTitleGap: 12,
          iconColor: kColorMutedText,
          textColor: kColorText,
          titleTextStyle: GoogleFonts.roboto(
            fontSize: 14,
            height: 1.2,
            fontWeight: FontWeight.w500,
            color: kColorText,
          ),
        ),
        dividerColor: kColorDivider,
      ),
      child: child,
    );
  }
}

class PortalDrawerHeader extends StatelessWidget {
  const PortalDrawerHeader({
    super.key,
    required this.name,
    required this.subtitle,
    required this.avatar,
    required this.onTap,
  });

  final String name;
  final String subtitle;
  final Widget avatar;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'Open profile settings',
        child: InkWell(
          key: const ValueKey('portal-drawer-profile-header'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 12),
            child: SizedBox(
              width: double.infinity,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  SizedBox.square(dimension: 56, child: avatar),
                  const SizedBox(height: 8),
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.roboto(
                      fontSize: 17,
                      height: 1.2,
                      fontWeight: FontWeight.w700,
                      color: kColorText,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      height: 1.35,
                      color: kColorMutedText,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class PortalDrawerSectionLabel extends StatelessWidget {
  const PortalDrawerSectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 6, 24, 3),
        child: Text(
          label.toUpperCase(),
          style: GoogleFonts.roboto(
            fontSize: 11,
            height: 1.2,
            fontWeight: FontWeight.w700,
            color: kColorMutedText,
          ),
        ),
      );
}

class PortalDrawerAction extends StatelessWidget {
  const PortalDrawerAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
    this.useExactAndroidDestinationLayout = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;
  final bool useExactAndroidDestinationLayout;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? Theme.of(context).colorScheme.error : null;
    final alignWithDestinations =
        !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

    if (alignWithDestinations && useExactAndroidDestinationLayout) {
      // NavigationDrawerDestination uses 12dp of tile padding followed by a
      // 16dp inset. Reproduce that row directly instead of relying on
      // ListTile's platform-dependent leading/title calculations.
      return Semantics(
        button: true,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 48,
            child: Padding(
              padding: const EdgeInsets.only(left: 24, right: 12),
              child: Row(
                children: [
                  Icon(icon, size: 22, color: color),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .listTileTheme
                          .titleTextStyle
                          ?.copyWith(color: color),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return ListTile(
      contentPadding: alignWithDestinations
          ? const EdgeInsets.only(left: 24, right: 12)
          : null,
      minLeadingWidth: alignWithDestinations ? 22 : null,
      horizontalTitleGap: alignWithDestinations ? 12 : null,
      titleAlignment:
          alignWithDestinations ? ListTileTitleAlignment.center : null,
      leading: Icon(icon, size: 22, color: color),
      title: Text(label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: color == null ? null : TextStyle(color: color)),
      onTap: onTap,
    );
  }
}

class PortalDrawerDivider extends StatelessWidget {
  const PortalDrawerDivider({super.key});

  @override
  Widget build(BuildContext context) => const Divider(
        height: 1,
        thickness: 1,
        indent: 24,
        endIndent: 24,
      );
}
