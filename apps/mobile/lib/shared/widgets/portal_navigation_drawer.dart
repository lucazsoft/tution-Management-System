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
          backgroundColor: kColorBg,
          surfaceTintColor: Colors.transparent,
          indicatorColor: kColorPrimary.withValues(alpha: .09),
          iconTheme: WidgetStateProperty.resolveWith(
            (states) => IconThemeData(
              size: 24,
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
          minTileHeight: 56,
          contentPadding: const EdgeInsets.only(left: 28, right: 16),
          minLeadingWidth: 24,
          horizontalTitleGap: 16,
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
  });

  final String name;
  final String subtitle;
  final Widget avatar;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(28, 24, 28, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox.square(dimension: 60, child: avatar),
            const SizedBox(height: 12),
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: kColorText,
                  ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: kColorMutedText),
            ),
          ],
        ),
      );
}

class PortalDrawerSectionLabel extends StatelessWidget {
  const PortalDrawerSectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(28, 10, 28, 6),
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
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? Theme.of(context).colorScheme.error : null;
    return ListTile(
      leading: Icon(icon, size: 24, color: color),
      title: Text(label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: color == null ? null : TextStyle(color: color)),
      onTap: onTap,
    );
  }
}
